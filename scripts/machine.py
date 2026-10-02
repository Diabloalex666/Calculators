#!/usr/bin/env python3
"""Daily/CI runner: health, Yandex sitemap ping, IndexNow. No article writing."""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import indexnow  # noqa: E402
import recrawl  # noqa: E402

SITE = "https://finraz.ru/"
SITEMAP = "https://finraz.ru/sitemap.xml"


def http_ok(url: str) -> tuple[bool, str]:
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "FinPulseSEO/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return 200 <= resp.status < 400, str(resp.status)
    except Exception as exc:
        return False, str(exc)


def yandex_sitemap_ping() -> str:
    url = "https://webmaster.yandex.ru/ping?" + urllib.parse.urlencode({"sitemap": SITEMAP})
    try:
        with urllib.request.urlopen(url, timeout=25) as resp:
            body = resp.read().decode("utf-8", "replace")
            return f"{resp.status} {body.strip()[:80]}"
    except Exception as exc:
        return f"FAIL {exc}"


def telegram(text: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat:
        return
    payload = json.dumps({"chat_id": chat, "text": text[:3500]}).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=20).read()
        print("telegram ok")
    except Exception as exc:
        print(f"telegram skip {exc}")


def main() -> int:
    ok, status = http_ok(SITE)
    print(f"health {SITE} -> {status}")
    if not ok:
        telegram(f"finraz.ru не отвечает: {status}")
        return 1

    print("yandex ping:", yandex_sitemap_ping())
    try:
        crawl = recrawl.run()
        print(
            "recrawl:",
            f"sent={len(crawl.get('sent') or [])}",
            crawl.get("error") or "",
        )
    except Exception as exc:
        print(f"recrawl skip {exc}")
    urls = indexnow.urls_from_sitemap()
    failed = indexnow.ping(urls)
    summary = f"finraz.ru 200, IndexNow {len(urls)} URL, endpoint-fail={failed}"
    print(summary)
    telegram("FinPulse: " + summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
