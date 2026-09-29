#!/usr/bin/env python3
"""Build sitemap.xml from public HTML. Does not bump lastmod on every CI run."""
from __future__ import annotations

from datetime import date
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://finraz.ru"
OUT = ROOT / "sitemap.xml"
SKIP = {
    "404.html",
    "googleb9162ec570428c78.html",
    "yandex_976af4219cec8212.html",
    "yandex_de4855562961c18c.html",
}
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


def existing_lastmod() -> dict[str, str]:
    if not OUT.exists():
        return {}
    tree = ET.parse(OUT)
    root = tree.getroot()
    tag = f"{{{NS}}}loc"
    mod = f"{{{NS}}}lastmod"
    found: dict[str, str] = {}
    for url in root:
        loc = url.find(tag)
        last = url.find(mod)
        if loc is not None and last is not None and loc.text:
            found[loc.text.strip()] = (last.text or "").strip()
    return found


def loc_for(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    if rel == "index.html":
        return f"{SITE}/"
    if rel.endswith("/index.html"):
        return f"{SITE}/{rel[:-10]}"
    return f"{SITE}/{rel}"


def priority_for(loc: str) -> str:
    if loc == f"{SITE}/":
        return "1.0"
    if loc.endswith(("/salary.html", "/vacation.html", "/sick.html", "/mortgage.html")):
        return "0.9"
    if "/articles/" in loc and loc.endswith("/articles/"):
        return "0.85"
    if "/articles/" in loc:
        return "0.75"
    if loc.endswith(("/about.html", "/privacy.html", "/terms.html")):
        return "0.3"
    return "0.6"


def main() -> None:
    prev = existing_lastmod()
    today = date.today().isoformat()
    pages: list[Path] = []
    pages.extend(sorted(ROOT.glob("*.html")))
    pages.extend(sorted((ROOT / "articles").glob("*.html")))
    pages.append(ROOT / "blog" / "index.html")

    urls: list[tuple[str, str, str]] = []
    seen: set[str] = set()
    for path in pages:
        if not path.exists() or path.name in SKIP:
            continue
        loc = loc_for(path)
        if loc in seen:
            continue
        seen.add(loc)
        last = prev.get(loc, today)
        urls.append((loc, last, priority_for(loc)))

    urls.sort(key=lambda row: (0 if row[0] == f"{SITE}/" else 1, row[0]))
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<urlset xmlns="{NS}">',
    ]
    for loc, last, pri in urls:
        freq = "weekly" if loc in {f"{SITE}/", f"{SITE}/articles/"} else "monthly"
        lines += [
            "  <url>",
            f"    <loc>{loc}</loc>",
            f"    <lastmod>{last}</lastmod>",
            f"    <changefreq>{freq}</changefreq>",
            f"    <priority>{pri}</priority>",
            "  </url>",
        ]
    lines.append("</urlset>")
    lines.append("")
    OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"wrote {len(urls)} urls -> {OUT}")


if __name__ == "__main__":
    main()
