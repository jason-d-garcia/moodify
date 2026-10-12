"""Score a song catalog with the fine-tuned BERT mood classifier.

Usage (from a checkout of bert-lyrics-sentiment-analysis with a trained
best_model_state.bin):

    python scripts/score_catalog.py \
        --bert_repo ../bert-lyrics-sentiment-analysis \
        --checkpoint ../bert-lyrics-sentiment-analysis/best_model_state.bin \
        --songs songs.csv \
        --out src/data/catalog.json

songs.csv needs columns: title, artist, lyrics. Lyrics are read locally for
inference only and are never written to the output, which keeps copyrighted
text out of the deployed site.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bert_repo", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--songs", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("src/data/catalog.json"))
    parser.add_argument("--max_len", type=int, default=160)
    parser.add_argument("--batch_size", type=int, default=16)
    args = parser.parse_args()

    sys.path.insert(0, str(args.bert_repo.resolve()))
    import pandas as pd
    import torch
    from transformers import BertTokenizer

    from dataset import ID2LABEL
    from model import SentimentClassifier

    device = torch.device("cuda" if torch.cuda.is_available()
                          else "mps" if torch.backends.mps.is_available() else "cpu")
    labels = [ID2LABEL[i] for i in range(len(ID2LABEL))]

    model = SentimentClassifier(len(labels)).to(device)
    model.load_state_dict(torch.load(args.checkpoint, map_location=device))
    model.eval()
    tokenizer = BertTokenizer.from_pretrained("bert-base-cased")

    df = pd.read_csv(args.songs).dropna(subset=["title", "artist", "lyrics"])
    songs = []
    with torch.no_grad():
        for start in range(0, len(df), args.batch_size):
            chunk = df.iloc[start:start + args.batch_size]
            enc = tokenizer(list(chunk["lyrics"].astype(str)), max_length=args.max_len,
                            truncation=True, padding="max_length", return_tensors="pt")
            logits = model(input_ids=enc["input_ids"].to(device),
                           attention_mask=enc["attention_mask"].to(device))
            probs = torch.softmax(logits, dim=1).cpu().tolist()
            for (_, row), p in zip(chunk.iterrows(), probs):
                songs.append({
                    "title": row["title"],
                    "artist": row["artist"],
                    "probs": {label: round(v, 4) for label, v in zip(labels, p)},
                })

    out = {
        "source": "bert",
        "note": f"Softmax output of {args.checkpoint.name} (bert-base-cased, max_len={args.max_len}).",
        "labels": labels,
        "songs": songs,
    }
    args.out.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"scored {len(songs)} songs -> {args.out}")


if __name__ == "__main__":
    main()
