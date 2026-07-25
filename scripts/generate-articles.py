#!/usr/bin/env python3
"""Generate SEO article HTML from generate-articles.mjs data and templates."""

from __future__ import annotations

import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
MJS_PATH = SCRIPT_DIR / "generate-articles.mjs"
OUT_DIR = ROOT / "articles"
SITE = "https://finraz.ru"


def find_bracket_end(s: str, start: int, open_c: str, close_c: str) -> int:
    depth = 0
    i = start
    in_str: str | None = None
    escape = False
    while i < len(s):
        c = s[i]
        if in_str:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == in_str:
                in_str = None
            i += 1
            continue
        if c in ('"', "'", "`"):
            in_str = c
            i += 1
            continue
        if c == open_c:
            depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError(f"Unclosed bracket starting at {start}")


def parse_js_string(s: str, pos: int) -> tuple[str, int]:
    quote = s[pos]
    if quote not in ('"', "'"):
        raise ValueError("Expected string quote")
    i = pos + 1
    out: list[str] = []
    mapping = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "'": "'", "\\": "\\"}
    while i < len(s):
        c = s[i]
        if c == "\\":
            i += 1
            if i >= len(s):
                break
            out.append(mapping.get(s[i], s[i]))
            i += 1
        elif c == quote:
            return "".join(out), i + 1
        else:
            out.append(c)
            i += 1
    raise ValueError("Unclosed JS string")


def parse_template(s: str, pos: int) -> tuple[str, int]:
    if s[pos] != "`":
        raise ValueError("Expected backtick template")
    i = pos + 1
    out: list[str] = []
    while i < len(s):
        c = s[i]
        if c == "\\":
            i += 1
            if i < len(s):
                out.append(s[i])
                i += 1
        elif c == "`":
            return "".join(out), i + 1
        else:
            out.append(c)
            i += 1
    raise ValueError("Unclosed template literal")


def field_string(block: str, name: str) -> str:
    m = re.search(rf"\b{name}:\s*", block)
    if not m:
        raise KeyError(name)
    rest = block[m.end() :].lstrip()
    if not rest.startswith('"'):
        raise ValueError(f"Expected quoted string for {name}")
    val, _ = parse_js_string(rest, 0)
    return val


def field_template(block: str, name: str) -> str:
    m = re.search(rf"\b{name}:\s*`", block)
    if not m:
        raise KeyError(name)
    val, _ = parse_template(block, m.end() - 1)
    return val


def field_string_array(block: str, name: str) -> list[str]:
    m = re.search(rf"\b{name}:\s*\[", block)
    if not m:
        raise KeyError(name)
    start = m.end() - 1
    end = find_bracket_end(block, start, "[", "]")
    inner = block[start + 1 : end]
    items: list[str] = []
    i = 0
    while i < len(inner):
        while i < len(inner) and inner[i] in " \t\n\r,":
            i += 1
        if i >= len(inner):
            break
        if inner[i] == '"':
            val, ni = parse_js_string(inner, i)
            items.append(val)
            i = ni
        else:
            i += 1
    return items


def field_faq(block: str) -> list[dict[str, str]]:
    m = re.search(r"\bfaq:\s*\[", block)
    if not m:
        raise KeyError("faq")
    start = m.end() - 1
    end = find_bracket_end(block, start, "[", "]")
    inner = block[start + 1 : end]
    faqs: list[dict[str, str]] = []
    i = 0
    while i < len(inner):
        if inner[i] != "{":
            i += 1
            continue
        obj_end = find_bracket_end(inner, i, "{", "}")
        obj = inner[i : obj_end + 1]
        faqs.append({"q": field_string(obj, "q"), "a": field_string(obj, "a")})
        i = obj_end + 1
    return faqs


def parse_articles(mjs_text: str) -> list[dict]:
    start = mjs_text.index("const ARTICLES = ")
    start = mjs_text.index("[", start)
    end = find_bracket_end(mjs_text, start, "[", "]")
    arr = mjs_text[start + 1 : end]
    articles: list[dict] = []
    i = 0
    while i < len(arr):
        if arr[i] != "{":
            i += 1
            continue
        obj_end = find_bracket_end(arr, i, "{", "}")
        block = arr[i : obj_end + 1]
        articles.append(
            {
                "slug": field_string(block, "slug"),
                "category": field_string(block, "category"),
                "calc": field_string(block, "calc"),
                "calcLabel": field_string(block, "calcLabel"),
                "title": field_string(block, "title"),
                "description": field_string(block, "description"),
                "h1": field_string(block, "h1"),
                "hero": field_string(block, "hero"),
                "related": field_string_array(block, "related"),
                "body": field_template(block, "body"),
                "faq": field_faq(block),
            }
        )
        i = obj_end + 1
    return articles


def extract_return_template(mjs_text: str, func_name: str) -> str:
    func_start = mjs_text.index(f"function {func_name}")
    ret = mjs_text.index("return `", func_start)
    tmpl, _ = parse_template(mjs_text, ret + len("return "))
    return tmpl


def js_shell_to_format(tmpl: str) -> str:
    def repl(match: re.Match[str]) -> str:
        expr = match.group(1)
        if expr == "SITE":
            return "{site}"
        if expr.startswith("a."):
            return "{" + expr[2:] + "}"
        if expr == "faqHtml":
            return "{faq_html}"
        if expr == "relatedLinks":
            return "{related_links}"
        if expr == "sections":
            return "{sections}"
        raise ValueError(f"Unsupported template expression: {expr}")

    return re.sub(r"\$\{([^}]+)\}", repl, tmpl)


def build_faq_html(faq: list[dict[str, str]]) -> str:
    parts: list[str] = []
    for f in faq:
        parts.append(
            f"""
        <div class="faq-item">
          <h3>{f['q']}</h3>
          <p>{f['a']}</p>
        </div>"""
        )
    return "".join(parts)


def build_related_links(related: list[str], articles: list[dict]) -> str:
    by_slug = {a["slug"]: a for a in articles}
    lines: list[str] = []
    for slug in related:
        r = by_slug.get(slug)
        if r:
            lines.append(f'<li><a href="{slug}.html">{r["h1"]}</a></li>')
    return "\n          ".join(lines)


def article_html(a: dict, articles: list[dict], shell_fmt: str) -> str:
    faq_html = build_faq_html(a["faq"])
    related_links = build_related_links(a["related"], articles)
    return shell_fmt.format(
        site=SITE,
        title=a["title"],
        description=a["description"],
        slug=a["slug"],
        h1=a["h1"],
        hero=a["hero"],
        category=a["category"],
        body=a["body"],
        calc=a["calc"],
        calcLabel=a["calcLabel"],
        faq_html=faq_html,
        related_links=related_links,
    )


def index_html(articles: list[dict], shell_fmt: str) -> str:
    by_category: dict[str, list[dict]] = {}
    for a in articles:
        by_category.setdefault(a["category"], []).append(a)

    section_parts: list[str] = []
    for cat, items in by_category.items():
        lis = "\n            ".join(
            f'<li><a href="{a["slug"]}.html">{a["h1"]}</a></li>' for a in items
        )
        section_parts.append(
            f"""
        <section class="articles-section">
          <h2>{cat}</h2>
          <ul class="articles-list">
            {lis}
          </ul>
        </section>"""
        )
    sections = "".join(section_parts)
    return shell_fmt.format(site=SITE, sections=sections)


def main() -> None:
    mjs_text = MJS_PATH.read_text(encoding="utf-8")
    articles = parse_articles(mjs_text)
    if len(articles) != 18:
        raise SystemExit(f"Expected 18 articles, got {len(articles)}")

    article_shell = js_shell_to_format(extract_return_template(mjs_text, "articleHtml"))
    index_shell = js_shell_to_format(extract_return_template(mjs_text, "indexHtml"))

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    generated: list[Path] = []
    for a in articles:
        out_path = OUT_DIR / f"{a['slug']}.html"
        out_path.write_text(article_html(a, articles, article_shell), encoding="utf-8")
        generated.append(out_path)
        print(f"OK {a['slug']}")

    index_path = OUT_DIR / "index.html"
    index_path.write_text(index_html(articles, index_shell), encoding="utf-8")
    generated.append(index_path)
    print("OK index.html")
    print(f"\nGenerated {len(articles)} articles + index")


if __name__ == "__main__":
    main()

