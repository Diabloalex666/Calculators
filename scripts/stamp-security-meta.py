#!/usr/bin/env python3
"""Stamp security meta tags into public HTML (CSP + referrer). Idempotent."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

META_BLOCK = """    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://mc.yandex.ru https://*.yandex.net https://*.yandex.ru; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://yandex.ru https://*.yandex.ru; connect-src 'self' https://mc.yandex.ru https://*.yandex.ru https://finpulse-feedback.finraz.workers.dev; font-src 'self' data:; frame-src https://yandex.ru https://*.yandex.ru; upgrade-insecure-requests"
    />
"""

SKIP_DIRS = {
    "seo-agent",
    "scripts",
    "worker",
    "docs",
    "Обновление",
    ".git",
    "node_modules",
    "_live-check",
    "_site",
}


def should_skip(path: Path) -> bool:
    parts = set(path.parts)
    return bool(parts & SKIP_DIRS)


def stamp(html: str) -> str:
    if "Content-Security-Policy" in html:
        # refresh existing block
        html = re.sub(
            r'\s*<meta name="referrer"[^>]*>\s*',
            "\n",
            html,
            count=1,
        )
        html = re.sub(
            r'\s*<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?/>\s*',
            "\n",
            html,
            count=1,
        )
    if "<meta charset=" in html:
        return html.replace("<meta charset=\"UTF-8\" />", "<meta charset=\"UTF-8\" />\n" + META_BLOCK, 1)
    if "<head>" in html:
        return html.replace("<head>", "<head>\n" + META_BLOCK, 1)
    return html


def main() -> int:
    n = 0
    for path in ROOT.rglob("*.html"):
        if should_skip(path):
            continue
        raw = path.read_text(encoding="utf-8")
        out = stamp(raw)
        if out != raw:
            path.write_text(out, encoding="utf-8")
            n += 1
            print("stamped", path.relative_to(ROOT))
    print(f"done {n} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
