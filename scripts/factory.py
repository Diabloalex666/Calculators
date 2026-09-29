#!/usr/bin/env python3
"""SEO factory: 10 systems from Vasin's guide, GitHub Pages edition.

Own tsekh on GitHub Pages: briefs, pack assembler, drip, consoles, audit.
Does not call an LLM. HTML comes from seo-agent/packs/ → queue → gate → articles/.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import indexnow  # noqa: E402


def load_hyphen(name: str):
    path = ROOT / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


quality_gate = load_hyphen("quality-gate")
build_sitemap = load_hyphen("build-sitemap")
assemble = load_hyphen("assemble")
ingest_console = load_hyphen("ingest-console")

SITE = "https://finraz.ru"
UA = {"User-Agent": "FinPulseFactory/1.0"}
MONEY = (
    "/salary.html",
    "/vacation.html",
    "/sick.html",
    "/mortgage.html",
    "/compound.html",
    "/budget.html",
)
SOURCES = ("consultant.ru", "pravo.gov.ru", "nalog.gov.ru", "sfr.gov.ru")


class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self.h1: list[str] = []
        self.canonical = ""
        self.robots = ""
        self.hrefs: list[str] = []
        self._cap = None
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "title":
            self._cap, self._buf = "title", []
        elif tag == "h1":
            self._cap, self._buf = "h1", []
        elif tag == "meta" and d.get("name") == "robots":
            self.robots = d.get("content") or ""
        elif tag == "link" and d.get("rel") == "canonical":
            self.canonical = d.get("href") or ""
        elif tag == "a" and d.get("href"):
            self.hrefs.append(d["href"])

    def handle_endtag(self, tag):
        if self._cap == "title" and tag == "title":
            self.title = "".join(self._buf).strip()
            self._cap = None
        if self._cap == "h1" and tag == "h1":
            self.h1.append("".join(self._buf).strip())
            self._cap = None

    def handle_data(self, data):
        if self._cap:
            self._buf.append(data)


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cfg() -> dict:
    return load_json(ROOT / "seo-agent" / "config.json", {})


def semantic_map() -> dict:
    return load_json(ROOT / "seo-agent" / "semantic-map.json", {"clusters": []})


def facts() -> list[dict]:
    return load_json(ROOT / "seo-agent" / "facts.json", {}).get("items", [])


def parse_html(path: Path) -> Page:
    p = Page()
    p.feed(path.read_text(encoding="utf-8"))
    return p


def article_files() -> list[Path]:
    return sorted(
        t for t in (ROOT / "articles").glob("*.html") if t.name != "index.html"
    )


def owner_for(cluster: dict) -> str:
    page = cluster.get("page") or ""
    cid = cluster.get("id") or ""
    blob = f"{page} {cid}"
    if "otpusknye" in blob or "/vacation" in page:
        return "/vacation.html"
    if "bolnichny" in blob or "/sick" in page:
        return "/sick.html"
    if "ipoteka" in blob or "/mortgage" in page:
        return "/mortgage.html"
    if "slozhnyy" in blob or "compound" in blob:
        return "/compound.html"
    if "byudzhet" in blob or "budget" in blob:
        return "/budget.html"
    return "/salary.html"


def file_for(page: str) -> Path | None:
    rel = page.lstrip("/")
    if not rel:
        return ROOT / "index.html"
    if rel.endswith("/"):
        cand = ROOT / rel / "index.html"
        return cand if cand.exists() else None
    cand = ROOT / rel
    return cand if cand.exists() else None


def updated_on(html: str) -> date | None:
    m = re.search(r"Обновлено:\s*(\d{4}-\d{2}-\d{2})", html)
    if not m:
        return None
    return date.fromisoformat(m.group(1))


def http_status(url: str) -> str:
    req = urllib.request.Request(url, method="GET", headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=18) as resp:
            return str(resp.status)
    except urllib.error.HTTPError as exc:
        return str(exc.code)
    except Exception as exc:
        return str(exc)[:80]


def facts_ok(cluster_id: str) -> tuple[bool, str]:
    linked = [f for f in facts() if cluster_id in (f.get("used_by") or [])]
    if not linked:
        return False, "нет записи в facts.json"
    missing = [f["id"] for f in linked if f.get("status") != "verified" or not f.get("value")]
    if missing:
        return False, "нет фактуры: " + ", ".join(missing)
    return True, "ok"


def sys1_semantics(smap: dict) -> dict:
    counts = defaultdict(int)
    holes = []
    for c in smap.get("clusters", []):
        st = c.get("status") or "unknown"
        counts[st] += 1
        path = file_for(c.get("page") or "")
        if st == "published" and path is None:
            holes.append(c.get("page"))
        if st in {"planned", "reserved"} and path is not None:
            holes.append(f"{c['id']}: файл есть, статус {st}")
    return {
        "counts": dict(counts),
        "holes": holes,
        "total": len(smap.get("clusters", [])),
    }


def sys2_briefs(smap: dict) -> dict:
    briefs = ROOT / "seo-agent" / "briefs"
    briefs.mkdir(parents=True, exist_ok=True)
    created = []
    missing = []
    for c in smap.get("clusters", []):
        if c.get("status") != "planned":
            continue
        slug = Path(c["page"]).stem
        path = briefs / f"{slug}.md"
        if path.exists():
            continue
        cid = c.get("id") or slug
        ok, reason = facts_ok(cid)
        q = ((c.get("main") or {}).get("q") or slug).strip()
        owner = owner_for(c)
        path.write_text(
            (
                f"# Бриф: {q}\n\n"
                f"- id: `{cid}`\n"
                f"- slug: `{Path(c['page']).name}`\n"
                f"- интент: {c.get('intent') or 'info'}\n"
                f"- владелец денег: `{owner}`\n"
                f"- статус фактуры: {reason}\n\n"
                f"## Поля\n\n"
                f"- title: {q}\n"
                f"- H1: (заполнить)\n"
                f"- description: (до 250 символов, заполнить)\n\n"
                f"## Стоп\n\n"
                f"Цифры только из `seo-agent/facts.json`. "
                f"Пока фактура не verified — пакет в `seo-agent/packs/` не собирать "
                f"и в очередь не класть.\n"
            ),
            encoding="utf-8",
            newline="\n",
        )
        created.append(slug)
        if not ok:
            missing.append(slug)
    return {"created": created, "missing": missing}


def sys3_write(smap: dict) -> dict:
    conf = cfg()
    write_on = bool(conf.get("tsekhWrite", True)) and (
        os.environ.get("FACTORY_WRITE") == "1"
        or os.environ.get("FACTORY_DRIP") == "1"
        or "--write" in sys.argv
        or "--drip" in sys.argv
    )
    cap = int(conf.get("dailyArticleCap") or 1)
    result = {"enabled": write_on, "queued": [], "skipped": []}
    if not write_on:
        result["skipped"].append("цех-писатель выключен")
        return result
    stamp = load_json(ROOT / "seo-agent" / "raw" / "last-publish.json", {})
    today = date.today().isoformat()
    if stamp.get("date") == today and len(stamp.get("files") or []) >= cap:
        result["skipped"].append("дневной кап уже выбран")
        return result
    queue_dir = ROOT / "seo-agent" / "queue"
    queue_dir.mkdir(parents=True, exist_ok=True)
    if any(queue_dir.glob("*.html")):
        result["skipped"].append("очередь уже не пуста")
        return result
    packs_dir = ROOT / "seo-agent" / "packs"
    if not packs_dir.exists():
        result["skipped"].append("нет папки packs")
        return result
    for pack_path in sorted(packs_dir.glob("*.json")):
        if len(result["queued"]) >= cap:
            break
        pack = load_json(pack_path, {})
        slug = pack.get("slug") or f"{pack_path.stem}.html"
        if not slug.endswith(".html"):
            slug += ".html"
        live = ROOT / "articles" / slug
        queued = queue_dir / slug
        if live.exists():
            result["skipped"].append(f"{slug} уже в articles/")
            continue
        if queued.exists():
            result["skipped"].append(f"{slug} уже в очереди")
            continue
        cluster_id = pack.get("cluster_id") or next(
            (c["id"] for c in smap.get("clusters", []) if (c.get("page") or "").endswith(slug)),
            "",
        )
        ok, reason = facts_ok(cluster_id) if cluster_id else (False, "кластер не найден")
        if not ok:
            result["skipped"].append(f"{slug}: {reason}")
            continue
        dest = assemble.write_queue(pack)
        html = dest.read_text(encoding="utf-8")
        errs = quality_gate.check(dest)
        if not any(s in html for s in SOURCES):
            errs.append("нет первоисточника")
        if not any(Path(m).name in html for m in MONEY):
            errs.append("нет ссылки на калькулятор")
        if errs:
            dest.unlink(missing_ok=True)
            result["skipped"].append(f"{slug}: {'; '.join(errs)}")
            continue
        result["queued"].append(slug)
    return result


def sys4_antidup(smap: dict) -> list[str]:
    issues = []
    by_q: dict[str, list[str]] = defaultdict(list)
    titles: dict[str, list[str]] = defaultdict(list)
    for c in smap.get("clusters", []):
        q = re.sub(r"\s+", " ", (c.get("main") or {}).get("q") or "").strip().lower()
        if q:
            by_q[q].append(c["id"])
    for q, ids in by_q.items():
        if len(ids) > 1:
            issues.append(f"один запрос {q!r} → {ids}")
    for path in article_files():
        p = parse_html(path)
        key = re.sub(r"\s+", " ", p.title.lower())
        titles[key].append(path.name)
    for title, names in titles.items():
        if title and len(names) > 1:
            issues.append(f"дубль title {title!r} → {names}")
    for c in smap.get("clusters", []):
        if c.get("intent") != "info":
            continue
        owner = owner_for(c)
        q = ((c.get("main") or {}).get("q") or "").lower()
        owner_name = Path(owner).stem.replace(".html", "")
        if owner_name and owner_name in q and "калькулятор" in q:
            issues.append(f"{c['id']} тянет запрос калькулятора {owner}")
    return issues


def sys7_monitor() -> dict:
    sitemap = ROOT / "sitemap.xml"
    urls = []
    if sitemap.exists():
        urls = re.findall(r"<loc>(.*?)</loc>", sitemap.read_text(encoding="utf-8"))
    bad = []
    ok = 0
    for url in urls:
        st = http_status(url)
        if st.startswith("2"):
            ok += 1
        else:
            bad.append({"url": url, "status": st})
    robots = http_status(f"{SITE}/robots.txt")
    key = cfg().get("indexNowKey") or ""
    key_st = http_status(f"{SITE}/{key}.txt") if key else "no-key"
    return {"ok": ok, "bad": bad, "robots": robots, "indexnow_key": key_st, "checked": len(urls)}


def sys8_audit() -> dict:
    orphans = []
    no_money = []
    no_source = []
    noindex = []
    inbound: dict[str, int] = defaultdict(int)
    pages = article_files()
    names = {p.name for p in pages}
    hub = ROOT / "articles" / "index.html"
    if hub.exists():
        for href in parse_html(hub).hrefs:
            dest = Path(href.split("#")[0]).name
            if dest in names:
                inbound[dest] += 1
    for path in pages:
        html = path.read_text(encoding="utf-8")
        p = parse_html(path)
        if "noindex" in p.robots.lower():
            noindex.append(path.name)
        if not any(src in html for src in SOURCES):
            no_source.append(path.name)
        money_hit = any(
            m.split("/")[-1] in " ".join(p.hrefs) or m in html for m in MONEY
        )
        if not money_hit:
            no_money.append(path.name)
        for href in p.hrefs:
            dest = href.split("#")[0].split("?")[0]
            dest = Path(dest).name
            if dest in names and dest != path.name:
                inbound[dest] += 1
    for path in pages:
        if inbound[path.name] == 0:
            orphans.append(path.name)
    return {
        "orphans": orphans,
        "no_money_cta": no_money,
        "no_source": no_source,
        "noindex": noindex,
    }


def sys9_refresh(days: int = 120) -> list[dict]:
    cutoff = date.today() - timedelta(days=days)
    out = []
    for path in article_files():
        html = path.read_text(encoding="utf-8")
        d = updated_on(html)
        if d and d < cutoff:
            out.append({"file": path.name, "updated": d.isoformat()})
    return out


def ensure_hub_link(slug: str, title: str) -> None:
    hub = ROOT / "articles" / "index.html"
    html = hub.read_text(encoding="utf-8")
    if slug in html:
        return
    item = f'            <li><a href="{slug}">{title}</a></li>\n'
    marker = "<h2>Зарплата</h2>"
    pos = html.find(marker)
    if pos == -1:
        return
    ul = html.find("<ul", pos)
    ul_end = html.find("</ul>", ul)
    html = html[:ul_end] + item + html[ul_end:]
    hub.write_text(html, encoding="utf-8", newline="\n")


def mark_published(smap: dict, page: str) -> None:
    for c in smap.get("clusters", []):
        if c.get("page") == page:
            c["status"] = "published"
    smap["updated"] = date.today().isoformat()
    save_json(ROOT / "seo-agent" / "semantic-map.json", smap)


def sys6_drip(smap: dict) -> dict:
    conf = cfg()
    cap = int(conf.get("dailyArticleCap") or 1)
    drip_flag = os.environ.get("FACTORY_DRIP") == "1" or "--drip" in sys.argv
    enabled = bool(conf.get("publishQueue")) and drip_flag
    queue_dir = ROOT / "seo-agent" / "queue"
    stamp_path = ROOT / "seo-agent" / "raw" / "last-publish.json"
    stamp = load_json(stamp_path, {})
    today = date.today().isoformat()
    result = {"enabled": enabled, "published": [], "skipped": []}
    if not enabled:
        result["skipped"].append("дрип выключен (нужны publishQueue и FACTORY_DRIP=1 или --drip)")
        return result
    if stamp.get("date") == today and len(stamp.get("files") or []) >= cap:
        result["skipped"].append("дневной кап уже выбран")
        return result
    if not queue_dir.exists():
        result["skipped"].append("нет папки queue")
        return result
    published_today = list(stamp.get("files") or []) if stamp.get("date") == today else []
    for src in sorted(queue_dir.glob("*.html")):
        if len(published_today) >= cap:
            break
        dest = ROOT / "articles" / src.name
        if dest.exists():
            result["skipped"].append(f"{src.name} уже в articles/")
            continue
        cluster_id = next(
            (c["id"] for c in smap.get("clusters", []) if c.get("page", "").endswith(src.name)),
            "",
        )
        ok, reason = facts_ok(cluster_id) if cluster_id else (False, "кластер не найден")
        if not ok:
            result["skipped"].append(f"{src.name}: {reason}")
            continue
        errs = quality_gate.check(src)
        html = src.read_text(encoding="utf-8")
        if not any(s in html for s in SOURCES):
            errs.append("нет первоисточника")
        if not any(Path(m).name in html for m in MONEY):
            errs.append("нет ссылки на калькулятор")
        if errs:
            result["skipped"].append(f"{src.name}: {'; '.join(errs)}")
            continue
        shutil.copyfile(src, dest)
        p = parse_html(dest)
        title = p.h1[0] if p.h1 else src.stem
        ensure_hub_link(src.name, title)
        mark_published(smap, f"/articles/{src.name}")
        published_today.append(src.name)
        result["published"].append(src.name)
        src.unlink()
    if result["published"]:
        build_sitemap.main()
        save_json(stamp_path, {"date": today, "files": published_today})
        urls = [f"{SITE}/articles/{name}" for name in result["published"]]
        if os.environ.get("CI") == "true":
            time.sleep(150)
        indexnow.ping(urls)
    return result


def sys10_advisor(report: dict) -> dict:
    missing = []
    raw = ROOT / "seo-agent" / "raw"
    console = load_json(raw / "console-summary.json", {})
    csvs = list(raw.glob("*.csv")) + list(raw.glob("*.tsv"))
    if not console.get("connected") and not csvs:
        missing.append("выгрузка GSC/Вебмастера (CSV в seo-agent/raw/)")
    planned = report["semantics"]["counts"].get("planned", 0)
    tempo = "1 статья в сутки из пакета" if planned else "очередь пуста — сначала семантика"
    week = []
    queued = sorted((ROOT / "seo-agent" / "queue").glob("*.html"))
    if report["drip"]["published"]:
        week.append("залиты из очереди: " + ", ".join(report["drip"]["published"]))
    elif (report.get("write") or {}).get("queued"):
        week.append("собраны в очередь: " + ", ".join(report["write"]["queued"]))
    elif queued:
        week.append("дрип очереди: " + ", ".join(p.name for p in queued[:3]))
    elif planned:
        week.append("пакет или фактура для следующей planned-темы")
    if report["monitor"]["bad"]:
        week.append("починить URL из monitor.bad")
    if report["refresh"]:
        week.append(f"рефреш {len(report['refresh'])} статей старше 120 дней")
    if not week:
        week.append("держать индекс и не плодить дубли")
    verdict = "green"
    reasons = []
    if report["monitor"]["bad"] or report["semantics"]["holes"] or report["antidup"]:
        verdict = "red"
        reasons.append("дыры в карте, живые 4xx или дубли интента")
    elif missing or report["audit"]["orphans"] or planned:
        verdict = "yellow"
        if planned:
            reasons.append(f"в очереди {planned} planned")
        if missing:
            reasons.append("не все контуры подключены: " + ", ".join(missing[:3]))
        if report["audit"]["orphans"]:
            reasons.append("есть сироты перелинковки")
    else:
        reasons.append("здоровье сайта и карта сходятся")
    return {
        "verdict": verdict,
        "reasons": reasons,
        "missing": missing,
        "tempo": tempo,
        "week": week,
        "next_prompt": next_prompt(report),
    }


def next_prompt(report: dict) -> str:
    queued = sorted((ROOT / "seo-agent" / "queue").glob("*.html"))
    if queued:
        return (
            f"В очереди {queued[0].name}. Завод сам прогонит гейт и зальёт "
            "не больше одной статьи за сутки."
        )
    planned = [
        c
        for c in load_json(ROOT / "seo-agent" / "semantic-map.json", {}).get("clusters", [])
        if c.get("status") == "planned"
    ]
    if not planned:
        return "Очередь planned пуста. Пополни semantic-map.json после разведки ниши."
    packs = ROOT / "seo-agent" / "packs"
    for c in planned:
        stem = Path(c["page"]).stem
        pack = packs / f"{stem}.json"
        ok, reason = facts_ok(c.get("id") or "")
        if pack.exists() and ok:
            return (
                f"Пакет {stem}.html готов. Завод сам соберёт HTML, прогонит гейт "
                "и зальёт не больше одной статьи за сутки."
            )
        if pack.exists() and not ok:
            return f"Пакет {stem} ждёт фактуру: {reason}."
    c = planned[0]
    stem = Path(c["page"]).stem
    ok, reason = facts_ok(c.get("id") or "")
    if not ok:
        return (
            f"Тема {stem} в плане, но {reason}. "
            "Внеси verified-цифру в seo-agent/facts.json — завод сам не выдумает ставку."
        )
    return (
        f"Собери пакет seo-agent/packs/{stem}.json по брифу "
        f"seo-agent/briefs/{stem}.md и эталону docs/article-standard.md. "
        "Цифры только из facts.json. Не публикуй пачкой."
    )


def render_panel(panel: dict) -> None:
    reasons = "".join(f"<li>{r}</li>" for r in panel.get("reasons") or [])
    actions = "\n".join(panel.get("advisor", {}).get("week") or [])
    html = f"""<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Панель SEO-машины — FinPulse</title>
    <style>
      :root {{ color-scheme: dark; }}
      body {{ margin: 0; font-family: Segoe UI, system-ui, sans-serif; background: #0f1419; color: #e7ecf3; }}
      .wrap {{ max-width: 820px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }}
      h1 {{ font-size: 1.4rem; }}
      .verdict {{ padding: 1rem 1.2rem; border-radius: 12px; background: #243044; margin: 1rem 0; }}
      .verdict.yellow {{ border-left: 4px solid #eab308; }}
      .verdict.green {{ border-left: 4px solid #34d399; }}
      .verdict.red {{ border-left: 4px solid #f87171; }}
      .grid {{ display: grid; gap: 0.8rem; grid-template-columns: 1fr 1fr; }}
      @media (max-width: 640px) {{ .grid {{ grid-template-columns: 1fr; }} }}
      .tile {{ background: #1a2332; border-radius: 12px; padding: 1rem; }}
      .num {{ font-variant-numeric: tabular-nums; font-size: 1.6rem; font-weight: 700; }}
      .muted {{ color: #8b9cb3; font-size: 0.9rem; }}
      pre {{ white-space: pre-wrap; background: #0b0f14; padding: 0.8rem; border-radius: 8px; font-size: 0.8rem; }}
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Панель FinPulse</h1>
      <p class="muted">Завод обновляет эту страницу сам. {panel.get("generated")}</p>
      <div class="verdict {panel.get("verdict")}" id="verdict">
        <strong>{panel.get("verdictText")}</strong>
        <ul>{reasons}</ul>
      </div>
      <div class="grid">
        <div class="tile">
          <div class="muted">Публикации сегодня / кап</div>
          <div class="num">{panel["publish"]["today"]} / {panel["publish"]["plan"]}</div>
          <p>Последние: {", ".join(panel["publish"]["latest"]) or "нет"}</p>
        </div>
        <div class="tile">
          <div class="muted">Запас тем</div>
          <div class="num">{panel["topics"]["planned"]}</div>
          <p>published {panel["topics"]["published"]}, reserved {panel["topics"]["reserved"]}</p>
        </div>
        <div class="tile">
          <div class="muted">Живой сайт</div>
          <div class="num">{panel["health"]["ok"]}/{panel["health"]["checked"]}</div>
          <p>4xx: {len(panel["health"]["bad"])}</p>
        </div>
        <div class="tile">
          <div class="muted">Аудит</div>
          <p>сироты {len(panel["audit"]["orphans"])}, без источника {len(panel["audit"]["no_source"])}</p>
        </div>
        <div class="tile">
          <div class="muted">Трафик 30 дней</div>
          <p>{panel["traffic"]["status"]}</p>
        </div>
        <div class="tile">
          <div class="muted">Позиции</div>
          <p>{panel["positions"]["status"]}</p>
        </div>
      </div>
      <h2>План на неделю</h2>
      <pre>{actions or "держать индекс"}</pre>
      <h2>Промпт на сегодня</h2>
      <pre>{panel.get("advisor", {}).get("next_prompt") or ""}</pre>
    </div>
  </body>
</html>
"""
    (ROOT / "seo-agent" / "panel.html").write_text(html, encoding="utf-8", newline="\n")


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
    live = "--offline" not in sys.argv
    console = ingest_console.ingest()
    smap = semantic_map()
    briefs = sys2_briefs(smap)
    write = sys3_write(smap)
    drip = sys6_drip(smap)
    smap = semantic_map()
    semantics = sys1_semantics(smap)
    antidup = sys4_antidup(smap)
    monitor = sys7_monitor() if live else {"ok": 0, "bad": [], "robots": "offline", "indexnow_key": "offline", "checked": 0}
    audit = sys8_audit()
    refresh = sys9_refresh()
    report = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "semantics": semantics,
        "briefs": briefs,
        "briefs_missing": briefs.get("missing") or [],
        "antidup": antidup,
        "write": write,
        "drip": drip,
        "monitor": monitor,
        "audit": audit,
        "refresh": refresh,
        "console": {"connected": console.get("connected"), "files": console.get("files") or []},
        "covers": "пропуск: обложки не генерируем",
    }
    advisor = sys10_advisor(report)
    report["advisor"] = advisor
    stamp = load_json(ROOT / "seo-agent" / "raw" / "last-publish.json", {})
    panel = {
        "generated": date.today().isoformat(),
        "verdict": advisor["verdict"],
        "verdictText": {"green": "Зелёный.", "yellow": "Жёлтый.", "red": "Красный."}[advisor["verdict"]],
        "reasons": advisor["reasons"],
        "actions": [{"title": w, "prompt": advisor["next_prompt"]} for w in advisor["week"]],
        "publish": {
            "today": len(drip.get("published") or []),
            "yesterday": 0,
            "plan": int(cfg().get("dailyArticleCap") or 1),
            "latest": drip.get("published") or stamp.get("files") or [],
        },
        "topics": {
            "planned": semantics["counts"].get("planned", 0),
            "reserved": semantics["counts"].get("reserved", 0),
            "published": semantics["counts"].get("published", 0),
            "daysLeft": "без Wordstat",
        },
        "traffic": console.get("traffic") or {"status": "не подключено", "hint": "CSV → seo-agent/raw/"},
        "positions": console.get("positions") or {"status": "не подключено", "hint": "GSC или Вебмастер CSV"},
        "audit": audit,
        "health": monitor,
        "advisor": advisor,
    }
    save_json(ROOT / "seo-agent" / "raw" / "latest.json", report)
    save_json(ROOT / "seo-agent" / "panel.json", panel)
    render_panel(panel)
    prompt_path = ROOT / "seo-agent" / "prompts" / "today.md"
    prompt_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_path.write_text(advisor["next_prompt"] + "\n", encoding="utf-8")
    lines = [
        f"FinPulse завод {advisor['verdict']}",
        f"карта {semantics['counts']}",
        f"живые {monitor['ok']}/{monitor['checked']} 4xx={len(monitor['bad'])}",
        f"очередь {drip}",
        f"писатель {write}",
        advisor["next_prompt"],
    ]
    text = "\n".join(lines)
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("utf-8", "replace").decode("utf-8", "replace"))
    telegram("\n".join(lines)[:3500])
    if live and monitor["bad"]:
        print("WARN live 4xx:", monitor["bad"])
    if semantics["holes"]:
        print("WARN map holes:", semantics["holes"])
    if antidup:
        print("WARN antidup:", antidup)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
