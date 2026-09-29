#!/usr/bin/env python3
"""Formal quality gate for FinPulse HTML articles. No LLM."""
from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self.description = ""
        self.canonical = ""
        self.h1: list[str] = []
        self.robots = ""
        self._capture = None
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "title":
            self._capture = "title"
            self._buf = []
        elif tag == "h1":
            self._capture = "h1"
            self._buf = []
        elif tag == "meta" and d.get("name") == "description":
            self.description = d.get("content") or ""
        elif tag == "meta" and d.get("name") == "robots":
            self.robots = d.get("content") or ""
        elif tag == "link" and d.get("rel") == "canonical":
            self.canonical = d.get("href") or ""

    def handle_endtag(self, tag):
        if self._capture == "title" and tag == "title":
            self.title = "".join(self._buf).strip()
            self._capture = None
        if self._capture == "h1" and tag == "h1":
            self.h1.append("".join(self._buf).strip())
            self._capture = None

    def handle_data(self, data):
        if self._capture:
            self._buf.append(data)


def check(path: Path) -> list[str]:
    html = path.read_text(encoding="utf-8")
    p = Page()
    p.feed(html)
    errors: list[str] = []
    if not p.title:
        errors.append("нет title")
    if len(p.description) > 250:
        errors.append(f"description {len(p.description)} > 250")
    if not p.description:
        errors.append("нет description")
    if len(p.h1) != 1:
        errors.append(f"H1 count={len(p.h1)}")
    if "finraz.ru" not in p.canonical:
        errors.append("canonical не на finraz.ru")
    slug = path.name
    if slug != slug.lower() or re.search(r"[А-Яа-я]", slug):
        errors.append("slug не латиница/нижний регистр")
    if "noindex" in p.robots.lower():
        errors.append("noindex")
    if "Обновлено:" not in html and path.parent.name in {"articles", "blog"}:
        errors.append("нет видимой даты «Обновлено»")
    return errors


def strict_extra(path: Path, html: str) -> list[str]:
    extra: list[str] = []
    sources = ("consultant.ru", "pravo.gov.ru", "nalog.gov.ru", "sfr.gov.ru")
    if not any(s in html for s in sources):
        extra.append("нет ссылки на первоисточник")
    money = ("salary.html", "vacation.html", "sick.html", "mortgage.html", "compound.html", "budget.html")
    if not any(m in html for m in money):
        extra.append("нет ссылки на калькулятор")
    return extra


def main() -> int:
    strict = "--strict" in sys.argv
    targets = [Path(a) for a in sys.argv[1:] if not a.startswith("--")]
    if not targets:
        targets = sorted((ROOT / "articles").glob("*.html"))
        targets = [t for t in targets if t.name != "index.html"]
    failed = 0
    for t in targets:
        errs = check(t)
        if strict:
            errs.extend(strict_extra(t, t.read_text(encoding="utf-8")))
        if errs:
            failed += 1
            print(f"FAIL {t}: {'; '.join(errs)}")
        else:
            print(f"OK   {t}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
