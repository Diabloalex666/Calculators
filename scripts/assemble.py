#!/usr/bin/env python3
"""Assemble one article HTML from a pack in seo-agent/packs/. No LLM. No invented rates."""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "seo-agent" / "packs"
QUEUE = ROOT / "seo-agent" / "queue"
SITE = "https://finraz.ru"


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
        bits.append(f'          <li><a href="{item["href"]}">{item["label"]}</a></li>')
    bits.append("        </ul>")
    bits.append("      </nav>")
    return "\n".join(bits)


def render(pack: dict) -> str:
    slug = pack["slug"]
    if not slug.endswith(".html"):
        slug += ".html"
    today = pack.get("date") or date.today().isoformat()
    url = f"{SITE}/articles/{slug}"
    calc = pack.get("calc") or "../salary.html"
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
    return f"""<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://mc.yandex.ru https://*.yandex.net https://*.yandex.ru; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://yandex.ru https://*.yandex.ru; connect-src 'self' https://mc.yandex.ru https://*.yandex.ru https://finpulse-feedback.finraz.workers.dev; font-src 'self' data:; frame-src https://yandex.ru https://*.yandex.ru; upgrade-insecure-requests"
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
        "author": {{ "@type": "Person", "name": "Алексей В.", "url": "https://finraz.ru/about.html" }},
        "publisher": {{ "@type": "Organization", "name": "FinPulse", "url": "https://finraz.ru/" }},
        "mainEntityOfPage": "{url}"
      }}
    </script>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="logo" href="../index.html">Fin<span>Pulse</span></a>
      </header>

      <nav class="breadcrumb" aria-label="Навигация">
        <a href="../index.html">Главная</a> →
        <a href="index.html">Статьи</a> →
        <span aria-current="page">{crumb}</span>
      </nav>

      <section class="hero">
        <h1>{pack["h1"]}</h1>
        <p>
          {pack["lead"]}
        </p>
      </section>

      <p class="byline">
        <a href="../about.html">Алексей В.</a>, редактор калькуляторов FinPulse
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
          <a href="../index.html">← Все калькуляторы</a>
          · <a href="index.html">Все статьи</a>
        </p>
        <p class="footer-nav">
          <a href="../about.html">О проекте</a>
          · <a href="../privacy.html">Конфиденциальность</a>
        </p>
        <p class="footer-copy">© FinPulse. Справочные расчёты.</p>
      </footer>
    </div>
    <script src="../js/config.js?v=4"></script>
    <script src="../js/analytics.js?v=4"></script>
    <script src="../js/seo.js?v=4"></script>
  </body>
</html>
"""


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
