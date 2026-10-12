#!/usr/bin/env python3
"""Assemble one article HTML from a pack in seo-agent/packs/. No LLM. No invented rates."""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "seo-agent" / "packs"
QUEUE = ROOT / "seo-agent" / "queue"
SITE = "https://finraz.ru"


def strip_public_html(html: str) -> str:
    """New pages keep .html on disk. Links and canonicals do not."""

    def public_path(path: str) -> str | None:
        name = path.rstrip("/").split("/")[-1]
        if not name.endswith(".html"):
            return None
        if name.startswith(("yandex_", "google")) or name == "404.html":
            return None
        if path.rstrip("/").endswith("/index.html") or name == "index.html":
            parent = path[: -len("index.html")]
            return parent if parent.endswith("/") else "/"
        return path[:-5]

    def one(url: str) -> str | None:
        def split_extra(raw: str) -> tuple[str, str]:
            path = raw
            extra = ""
            if "#" in path:
                path, frag = path.split("#", 1)
                extra = "#" + frag
            if "?" in path:
                path, query = path.split("?", 1)
                extra = "?" + query + extra
            return path, extra

        if url.startswith(SITE + "/"):
            path, extra = split_extra(url[len(SITE) :])
            cleaned = public_path(path)
            return None if cleaned is None else SITE + cleaned + extra
        path, extra = split_extra(url)
        if not path.endswith(".html"):
            return None
        if path.startswith("/"):
            cleaned = public_path(path)
            return None if cleaned is None else cleaned + extra
        leaf = path.split("/")[-1]
        if path.startswith("../"):
            if leaf == "index.html":
                return "/" + extra
            cleaned = public_path("/" + leaf)
            return None if cleaned is None else cleaned + extra
        if leaf == "index.html":
            return "/articles/" + extra
        return "/articles/" + leaf[:-5] + extra

    def repl_href(match: re.Match) -> str:
        quote, url = match.group(1), match.group(2)
        new = one(url)
        if not new or new == url:
            return match.group(0)
        return f"href={quote}{new}{quote}"

    html = re.sub(r"\bhref=(['\"])([^'\"]+)\1", repl_href, html)
    html = re.sub(
        r"https://finraz\.ru/[^\"'\s<>]*\.html",
        lambda match: one(match.group(0)) or match.group(0),
        html,
    )
    return html


def load_pack(slug: str) -> dict:
    stem = slug.replace(".html", "")
    path = PACKS / f"{stem}.json"
    if not path.exists():
        raise FileNotFoundError(path)
    return json.loads(path.read_text(encoding="utf-8"))


def faq_html(faqs: list[dict]) -> str:
    if not faqs:
        return ""
    bits = ['        <h2>Частые вопросы</h2>']
    for item in faqs:
        bits.append("        <div class=\"faq-item\">")
        bits.append(f"          <h3>{item['q']}</h3>")
        bits.append(f"          <p>{item['a']}</p>")
        bits.append("        </div>")
    return "\n".join(bits) + "\n"


def sources_html(sources: list[dict]) -> str:
    bits = ['        <h2>Источники</h2>', '        <ul class="sources">']
    for src in sources:
        bits.append("          <li>")
        bits.append(
            f'            <a href="{src["href"]}" rel="noopener" target="_blank">{src["label"]}</a>'
        )
        note = src.get("note") or ""
        if note:
            bits.append(f"            — {note}")
        bits.append("          </li>")
    bits.append("        </ul>")
    return "\n".join(bits) + "\n"


def related_html(related: list[dict]) -> str:
    bits = [
        '      <nav class="related-calc" aria-label="Похожие статьи">',
        "        <h2>Читайте также</h2>",
        "        <ul>",
    ]
    for item in related:
        href = item["href"]
        leaf = href.split("#")[0].split("?")[0].split("/")[-1]
        if leaf.endswith(".html"):
            stem = leaf[:-5]
            href = "/articles/" if stem == "index" else f"/articles/{stem}"
        bits.append(f'          <li><a href="{href}">{item["label"]}</a></li>')
    bits.append("        </ul>")
    bits.append("      </nav>")
    return "\n".join(bits)


def render(pack: dict) -> str:
    slug = pack["slug"]
    if not slug.endswith(".html"):
        slug += ".html"
    today = pack.get("date") or date.today().isoformat()
    url = f"{SITE}/articles/{slug[:-5] if slug.endswith('.html') else slug}"
    calc = pack.get("calc") or "/salary"
    if calc.endswith(".html"):
        calc = "/" + calc.split("/")[-1][:-5]
    calc_label = pack.get("calcLabel") or "Калькулятор зарплаты"
    css_v = pack.get("cssV") or "14"
    og_title = pack.get("ogTitle") or pack["h1"]
    og_desc = pack.get("ogDescription") or pack["description"]
    crumb = pack.get("crumb") or "Статья"
    headline = pack.get("headline") or pack["h1"]
    body = pack["body"].rstrip() + "\n"
    faqs = pack.get("faqs") or []
    note = pack.get("note") or (
        "Расчёт справочный. Табель, районный коэффициент и премии меняют сумму — "
        "сверяйте с расчётным листком."
    )
    cta = pack.get("cta") or f"Посчитайте полный оклад на руки в калькуляторе."
    html = f"""<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://mc.yandex.ru https://*.yandex.net https://*.yandex.ru https://top-fwz1.mail.ru; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://yandex.ru https://*.yandex.ru https://top-fwz1.mail.ru; connect-src 'self' https://mc.yandex.ru https://*.yandex.ru https://finpulse-feedback.finraz.workers.dev https://top-fwz1.mail.ru; font-src 'self' data:; frame-src https://yandex.ru https://*.yandex.ru; upgrade-insecure-requests"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <title>{pack["title"]}</title>
    <meta
      name="description"
      content="{pack["description"]}"
    />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="{url}" />
    <meta property="og:title" content="{og_title}" />
    <meta property="og:description" content="{og_desc}" />
    <meta property="og:url" content="{url}" />
    <meta property="og:type" content="article" />
    <meta property="og:locale" content="ru_RU" />
    <link rel="stylesheet" href="../css/style.css?v={css_v}" />
    <script type="application/ld+json">
      {{
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": "{headline}",
        "datePublished": "{today}",
        "dateModified": "{today}",
        "inLanguage": "ru-RU",
        "author": {{ "@type": "Person", "name": "Алексей В.", "url": "https://finraz.ru/about" }},
        "publisher": {{ "@type": "Organization", "name": "FinPulse", "url": "https://finraz.ru/" }},
        "mainEntityOfPage": "{url}"
      }}
    </script>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="logo" href="/">Fin<span>Pulse</span></a>
      </header>

      <nav class="breadcrumb" aria-label="Навигация">
        <a href="/">Главная</a> →
        <a href="/articles/">Статьи</a> →
        <span aria-current="page">{crumb}</span>
      </nav>

      <section class="hero">
        <h1>{pack["h1"]}</h1>
        <p>
          {pack["lead"]}
        </p>
      </section>

      <p class="byline">
        <a href="/about">Алексей В.</a>, редактор калькуляторов FinPulse
        · <span>Обновлено: {today}</span>
      </p>

      <section class="seo-block article-block article-page">
{body}
{faq_html(faqs)}
{sources_html(pack.get("sources") or [])}
        <p class="article-note">
          {note}
        </p>
      </section>

      <div class="article-cta panel">
        <p class="note" style="margin-top:0">
          {cta}
        </p>
        <a class="btn" href="{calc}">{calc_label} →</a>
      </div>

{related_html(pack.get("related") or [])}

      <footer class="site-footer">
        <p class="footer-nav">
          <a href="/">← Все калькуляторы</a>
          · <a href="/articles/">Все статьи</a>
        </p>
        <p class="footer-nav">
          <a href="/about">О проекте</a>
          · <a href="/privacy">Конфиденциальность</a>
        </p>
        <p class="footer-copy">© FinPulse. Справочные расчёты.</p>
      </footer>
    </div>
    <script src="../js/config.js?v=6"></script>
    <script src="../js/analytics.js?v=6"></script>
    <script src="../js/seo.js?v=5"></script>
  </body>
</html>
"""
    return strip_public_html(html)


def write_queue(pack: dict) -> Path:
    QUEUE.mkdir(parents=True, exist_ok=True)
    slug = pack["slug"]
    if not slug.endswith(".html"):
        slug += ".html"
    dest = QUEUE / slug
    dest.write_text(render(pack), encoding="utf-8", newline="\n")
    return dest


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python scripts/assemble.py <slug>")
        return 2
    pack = load_pack(sys.argv[1])
    path = write_queue(pack)
    print(f"queued {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
