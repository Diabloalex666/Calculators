#!/usr/bin/env python3
"""Цех переобхода: заново ставит важные страницы в очередь обхода Яндекса.

Квота берётся из Вебмастера, не из константы. Повтор в тот же день не шлётся.
Секрет YANDEX_WEBMASTER_TOKEN — только в окружении или локальном .env.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import indexnow  # noqa: E402
import yandex_api  # noqa: E402

RAW = ROOT / "seo-agent" / "raw"
LOG = RAW / "recrawl.json"
SITE = "https://finraz.ru"

# Сначала свежая статья, потом страницы, с которых идут деньги.
CORE = [
    f"{SITE}/",
    f"{SITE}/salary.html",
    f"{SITE}/vacation.html",
    f"{SITE}/sick.html",
    f"{SITE}/mortgage.html",
    f"{SITE}/compound.html",
    f"{SITE}/budget.html",
    f"{SITE}/articles/",
    f"{SITE}/articles/index.html",
    f"{SITE}/blog/",
]


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def fresh_article_urls() -> list[str]:
    stamp = load_json(RAW / "last-publish.json")
    names = stamp.get("files") or []
    return [f"{SITE}/articles/{name}" for name in names if str(name).endswith(".html")]


def candidates() -> list[str]:
    live = set(indexnow.urls_from_sitemap())
    ordered: list[str] = []
    seen: set[str] = set()
    for url in fresh_article_urls() + CORE:
        if url in seen or url not in live:
            continue
        seen.add(url)
        ordered.append(url)
    return ordered


def sent_today(log: dict, today: str) -> set[str]:
    if log.get("date") != today:
        return set()
    return {row.get("url") for row in (log.get("sent") or []) if row.get("url")}


def run() -> dict:
    today = date.today().isoformat()
    log = load_json(LOG)
    report = {
        "date": today,
        "connected": False,
        "quota": None,
        "sent": list(log.get("sent") or []) if log.get("date") == today else [],
        "skipped": [],
        "error": None,
    }
    ctx = yandex_api.webmaster_context()
    if ctx.get("error"):
        report["error"] = ctx["error"]
        yandex_api.save_json(LOG, report)
        return report

    try:
        quota = yandex_api.recrawl_quota(ctx)
    except Exception as exc:
        report["error"] = f"quota: {exc}"
        yandex_api.save_json(LOG, report)
        return report

    report["connected"] = True
    report["quota"] = quota
    remainder = int(quota.get("quota_remainder") or 0)
    already = sent_today(log, today)

    for url in candidates():
        if remainder <= 0:
            report["skipped"].append(f"{url}: квота кончилась")
            break
        if url in already:
            report["skipped"].append(f"{url}: уже отправлен сегодня")
            continue
        try:
            result = yandex_api.enqueue_recrawl(ctx, url)
        except Exception as exc:
            result = {"status": 0, "url": url, "error": str(exc)}
        status = int(result.get("status") or 0)
        # 202 — принят, 409 — уже в очереди. Оба не надо слать повторно сегодня.
        if status in (202, 409):
            report["sent"].append({"url": url, "status": status, "task_id": result.get("task_id")})
            already.add(url)
            if status == 202:
                remainder = int(result.get("quota_remainder") if result.get("quota_remainder") is not None else remainder - 1)
        elif status == 429:
            report["skipped"].append(f"{url}: квота")
            remainder = 0
        else:
            report["skipped"].append(f"{url}: HTTP {status}")

    report["quota_remainder"] = remainder
    yandex_api.save_json(LOG, report)
    return report


def main() -> int:
    report = run()
    print(json.dumps({
        "connected": report.get("connected"),
        "error": report.get("error"),
        "sent": len(report.get("sent") or []),
        "skipped": report.get("skipped") or [],
        "quota_remainder": report.get("quota_remainder"),
    }, ensure_ascii=False))
    return 0 if not report.get("error") else 0


if __name__ == "__main__":
    raise SystemExit(main())
