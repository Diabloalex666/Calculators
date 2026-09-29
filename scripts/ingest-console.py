#!/usr/bin/env python3
"""Parse dropped GSC / Yandex Webmaster / Metrika CSVs into seo-agent/raw/console-summary.json."""
from __future__ import annotations

import csv
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "seo-agent" / "raw"
OUT = RAW / "console-summary.json"

QUERY_HINTS = ("query", "запрос", "поисковый запрос", "top queries")
CLICK_HINTS = ("clicks", "клики", "кликов")
IMP_HINTS = ("impressions", "показы", "показов")
POS_HINTS = ("position", "позиция", "ср. позиция", "средняя позиция")
CTR_HINTS = ("ctr",)
VISIT_HINTS = ("visits", "визиты", "посетители", "sessions")


def nrm(s: str) -> str:
    return (s or "").strip().lower().replace("\ufeff", "")


def col(headers: list[str], hints: tuple[str, ...]) -> int | None:
    for i, h in enumerate(headers):
        name = nrm(h)
        for hint in hints:
            if name == hint or hint in name:
                return i
    return None


def num(val: str) -> float:
    t = (val or "").strip().replace("%", "").replace("\xa0", "").replace(" ", "")
    t = t.replace(",", ".")
    if not t:
        return 0.0
    try:
        return float(t)
    except ValueError:
        return 0.0


def sniff(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    rows = list(csv.reader(text.splitlines(), dialect))
    if not rows:
        return []
    headers = [nrm(h) for h in rows[0]]
    qi = col(headers, QUERY_HINTS)
    ci = col(headers, CLICK_HINTS)
    ii = col(headers, IMP_HINTS)
    pi = col(headers, POS_HINTS)
    vi = col(headers, VISIT_HINTS)
    out = []
    for raw in rows[1:]:
        if not raw or all(not c.strip() for c in raw):
            continue
        item = {"file": path.name}
        if qi is not None and qi < len(raw):
            item["query"] = raw[qi].strip()
        if ci is not None and ci < len(raw):
            item["clicks"] = num(raw[ci])
        if ii is not None and ii < len(raw):
            item["impressions"] = num(raw[ii])
        if pi is not None and pi < len(raw):
            item["position"] = num(raw[pi])
        if vi is not None and vi < len(raw):
            item["visits"] = num(raw[vi])
        if item.get("query") or item.get("visits"):
            out.append(item)
    return out


def detect_kind(path: Path, rows: list[dict]) -> str:
    name = path.name.lower()
    if "gsc" in name or "search-console" in name or "searchconsole" in name:
        return "gsc"
    if "webmaster" in name or "вебмастер" in name or "yandex" in name:
        return "webmaster"
    if "metrika" in name or "метрика" in name:
        return "metrika"
    if rows and rows[0].get("query") and ("clicks" in rows[0] or "impressions" in rows[0]):
        return "gsc"
    if rows and rows[0].get("visits"):
        return "metrika"
    return "unknown"


def ingest() -> dict:
    RAW.mkdir(parents=True, exist_ok=True)
    files = sorted(
        p
        for p in RAW.iterdir()
        if p.suffix.lower() in {".csv", ".tsv"} and not p.name.startswith("_")
    )
    buckets = {"gsc": [], "webmaster": [], "metrika": [], "unknown": []}
    for path in files:
        rows = sniff(path)
        kind = detect_kind(path, rows)
        buckets[kind].extend(rows)
    def top(items: list[dict], key: str, n: int = 10) -> list[dict]:
        scored = [x for x in items if x.get(key)]
        scored.sort(key=lambda x: x.get(key) or 0, reverse=True)
        return scored[:n]

    gsc = buckets["gsc"]
    wm = buckets["webmaster"]
    met = buckets["metrika"]
    clicks = sum(x.get("clicks") or 0 for x in gsc + wm)
    imps = sum(x.get("impressions") or 0 for x in gsc + wm)
    visits = sum(x.get("visits") or 0 for x in met)
    connected = bool(files)
    summary = {
        "updated": date.today().isoformat(),
        "files": [p.name for p in files],
        "connected": connected,
        "traffic": {
            "status": (
                f"клики {int(clicks)}, показы {int(imps)}"
                if clicks or imps
                else (f"визиты {int(visits)}" if visits else "файлов нет — положи CSV в seo-agent/raw/")
            ),
            "clicks": clicks,
            "impressions": imps,
            "visits": visits,
        },
        "positions": {
            "status": "топ запросов из выгрузки" if (gsc or wm) else "нет запросов в CSV",
            "top": top(gsc or wm, "clicks"),
        },
        "counts": {k: len(v) for k, v in buckets.items()},
    }
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    s = ingest()
    print(json.dumps({"connected": s["connected"], "files": s["files"], "traffic": s["traffic"]["status"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
