#!/usr/bin/env python3
"""Insert visible update date on articles that lack it."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTICLES = ROOT / "articles"
STAMP = '\n      <p class="byline"><span>Обновлено: 2026-07-25</span></p>\n'
HERO = re.compile(r'(<section class="hero">[\s\S]*?</section>)', re.MULTILINE)


def main() -> None:
    for path in sorted(ARTICLES.glob("*.html")):
        if path.name == "index.html":
            continue
        text = path.read_text(encoding="utf-8")
        if "Обновлено:" in text:
            print(f"OK    {path.name}")
            continue
        new, n = HERO.subn(r"\1" + STAMP, text, count=1)
        if n != 1:
            print(f"SKIP  {path.name}")
            continue
        path.write_text(new, encoding="utf-8", newline="\n")
        print(f"STAMP {path.name}")


if __name__ == "__main__":
    main()
