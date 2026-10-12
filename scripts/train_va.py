"""Fine-tune BERT to regress valence and arousal from lyrics, and compare it with the
4-class model's expected-quadrant mapping on the same held-out songs.

Input CSV columns: title, artist, lyrics, valence, arousal (valence/arousal in [-1, 1]),
plus optional quadrant (Q1..Q4) used to stratify the split.

    python train_va.py --data va_lyrics.csv --cls_checkpoint best_model_state.bin
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.model_selection import train_test_split
from torch import nn
from transformers import BertModel, BertTokenizer, get_linear_schedule_with_warmup

from dataset import ID2LABEL
from model import SentimentClassifier


class VARegressor(nn.Module):
    def __init__(self, pretrained_name: str = "bert-base-cased", dropout_p: float = 0.3):
        super().__init__()
        self.bert = BertModel.from_pretrained(pretrained_name)
        self.drop = nn.Dropout(p=dropout_p)
        self.out = nn.Linear(self.bert.config.hidden_size, 2)

    def forward(self, input_ids, attention_mask):
        pooled = self.bert(input_ids=input_ids, attention_mask=attention_mask)["pooler_output"]
        return torch.tanh(self.out(self.drop(pooled)))  # [batch, 2] in [-1, 1]


def device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def batches(texts, tokenizer, max_len, batch_size):
    for i in range(0, len(texts), batch_size):
        enc = tokenizer(list(texts[i:i + batch_size]), max_length=max_len, truncation=True,
                        padding="max_length", return_tensors="pt")
        yield i, enc["input_ids"], enc["attention_mask"]


def predict(model, texts, tokenizer, max_len, batch_size, dev, fn):
    model.eval()
    out = []
    with torch.no_grad():
        for _, ids, mask in batches(texts, tokenizer, max_len, batch_size):
            out.append(fn(model(input_ids=ids.to(dev), attention_mask=mask.to(dev))).cpu())
    return torch.cat(out).numpy()


def metrics(pred: np.ndarray, true: np.ndarray) -> dict:
    res = {}
    for j, name in enumerate(["valence", "arousal"]):
        p, t = pred[:, j], true[:, j]
        err = p - t
        res[name] = {
            "mae": float(np.mean(np.abs(err))),
            "rmse": float(np.sqrt(np.mean(err ** 2))),
            "pearson": float(np.corrcoef(p, t)[0, 1]),
            "r2": float(1 - np.sum(err ** 2) / np.sum((t - t.mean()) ** 2)),
        }
    return res


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--cls_checkpoint", default="best_model_state.bin")
    ap.add_argument("--out", default="va_model_state.bin")
    ap.add_argument("--max_len", type=int, default=160)
    ap.add_argument("--batch_size", type=int, default=8)
    ap.add_argument("--epochs", type=int, default=5)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    dev = device()

    df = pd.read_csv(args.data).dropna(subset=["lyrics", "valence", "arousal"])
    strat = df["quadrant"] if "quadrant" in df else None
    train_df, temp_df = train_test_split(df, test_size=0.2, random_state=args.seed, stratify=strat)
    strat_t = temp_df["quadrant"] if "quadrant" in temp_df else None
    val_df, test_df = train_test_split(temp_df, test_size=0.5, random_state=args.seed, stratify=strat_t)
    print(f"split: {len(train_df)} train / {len(val_df)} val / {len(test_df)} test")

    tok = BertTokenizer.from_pretrained("bert-base-cased")
    model = VARegressor().to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    steps = (len(train_df) + args.batch_size - 1) // args.batch_size * args.epochs
    sched = get_linear_schedule_with_warmup(opt, num_warmup_steps=int(0.1 * steps), num_training_steps=steps)
    loss_fn = nn.MSELoss()

    y_train = torch.tensor(train_df[["valence", "arousal"]].to_numpy(), dtype=torch.float32)
    y_val = val_df[["valence", "arousal"]].to_numpy()
    best = float("inf")
    for epoch in range(args.epochs):
        model.train()
        perm = np.random.permutation(len(train_df))
        texts = train_df["lyrics"].to_numpy()[perm]
        ys = y_train[perm]
        losses = []
        for i, ids, mask in batches(texts, tok, args.max_len, args.batch_size):
            pred = model(input_ids=ids.to(dev), attention_mask=mask.to(dev))
            loss = loss_fn(pred, ys[i:i + args.batch_size].to(dev))
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad()
            losses.append(loss.item())
        val_pred = predict(model, val_df["lyrics"].to_numpy(), tok, args.max_len, args.batch_size, dev, lambda x: x)
        val_mse = float(np.mean((val_pred - y_val) ** 2))
        print(f"epoch {epoch + 1}: train mse {np.mean(losses):.4f}  val mse {val_mse:.4f}")
        if val_mse < best:
            best = val_mse
            torch.save(model.state_dict(), args.out)

    model.load_state_dict(torch.load(args.out, map_location=dev))
    texts = test_df["lyrics"].to_numpy()
    y_test = test_df[["valence", "arousal"]].to_numpy()
    va_pred = predict(model, texts, tok, args.max_len, args.batch_size, dev, lambda x: x)

    report = {"n_test": len(test_df), "regressor": metrics(va_pred, y_test)}

    # Baselines on the same songs: predict the training mean, and the 4-class model's
    # expected-quadrant coordinates (no temperature; argmax-insensitive mapping).
    report["mean_baseline"] = metrics(np.tile(y_train.numpy().mean(0), (len(y_test), 1)), y_test)
    if Path(args.cls_checkpoint).exists():
        cls = SentimentClassifier(len(ID2LABEL)).to(dev)
        cls.load_state_dict(torch.load(args.cls_checkpoint, map_location=dev))
        probs = predict(cls, texts, tok, args.max_len, args.batch_size, dev, lambda x: torch.softmax(x, 1))
        p = {ID2LABEL[k]: probs[:, k] for k in range(len(ID2LABEL))}
        quad = np.stack([p["happy"] + p["relaxed"] - p["angry"] - p["sad"],
                         p["happy"] + p["angry"] - p["sad"] - p["relaxed"]], 1)
        report["four_class_mapping"] = metrics(quad, y_test)
        report["four_class_mapping_note"] = ("4-class model was trained on MoodyLyrics; test songs may overlap "
                                             "with its training data only if the same songs appear in both corpora")

    Path("va_report.json").write_text(json.dumps(report, indent=2))
    test_df.assign(pred_valence=va_pred[:, 0], pred_arousal=va_pred[:, 1]).drop(columns=["lyrics"]) \
        .to_csv("va_test_predictions.csv", index=False)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
