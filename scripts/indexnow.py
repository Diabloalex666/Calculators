#!/usr/bin/env python3
"""Ping IndexNow. No args = all <loc> from sitemap.xml."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEY = "a8c3e17f6b924d0ea51c8f2d9b4e60c1"
HOST = "finraz.ru"
KEY_LOC = f"https://{HOST}/{KEY}.txt"
ENDPOINTS = (
    "https://yandex.com/indexnow",
    "https://www.bing.com/indexnow",
    "https://api.indexnow.org/indexnow",
)
NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def urls_from_sitemap() -> list[str]:
    tree = ET.parse(ROOT / "sitemap.xml")
    return [el.text.strip() for el in tree.getroot().findall("sm:url/sm:loc", NS) if el.text]


def ping(urls: list[str]) -> int:
    payload = json.dumps(
        {"host": HOST, "key": KEY, "keyLocation": KEY_LOC, "urlList": urls},
        ensure_ascii=False,
    ).encode("utf-8")
    failed = 0
    for endpoint in ENDPOINTS:
        req = urllib.request.Request(
            endpoint,
            data=payload,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                print(f"{endpoint} -> {resp.status}")
        except urllib.error.HTTPError as exc:
            failed += 1
            print(f"{endpoint} -> HTTP {exc.code}")
        except Exception as exc:
            failed += 1
            print(f"{endpoint} -> FAIL {exc}")
    return failed


if __name__ == "__main__":
    urls = [u.strip() for u in sys.argv[1:] if u.strip()] or urls_from_sitemap()
    if not urls:
        sys.exit("нет URL")
    print(f"ping {len(urls)} urls")
    sys.exit(1 if ping(urls) == len(ENDPOINTS) else 0)
