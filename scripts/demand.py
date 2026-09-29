#!/usr/bin/env python3
"""Yandex demand shop: suggest + Webmaster/GSC/Wordstat CSV. No invented frequencies."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "seo-agent" / "raw"
MAP_PATH = ROOT / "seo-agent" / "semantic-map.json"
OUT = RAW / "demand.json"
UA = {"User-Agent": "FinPulseDemand/1.0"}

CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
}
STOP_NEW = (
    "калькулятор",
    "скачать",
    "бесплатно excel",
    "бланк",
)
FACT_HINTS = (
    (("аванс",), "advance-not-fixed-50"),
    (("увольн",), "final-pay-140"),
    (("неполн", "табел"), "salary-time-pay"),
    (("отпускн",), "vacation-days-115"),
)


def attach_fact(cluster_id: str, q: str) -> None:
    facts_path = ROOT / "seo-agent" / "facts.json"
    data = load_json(facts_path, {"items": []})
    toks = tokens(q)
    hit = None
    for keys, fid in FACT_HINTS:
        if any(k in " ".join(toks) or k in nrm(q) for k in keys):
            hit = fid
            break
    if not hit:
        return
    for item in data.get("items") or []:
        if item.get("id") != hit:
            continue
        used = list(item.get("used_by") or [])
        if cluster_id not in used:
            used.append(cluster_id)
            item["used_by"] = used
            save_json(facts_path, data)
        return


SEEDS_EXTRA = (
    "калькулятор зарплаты на руки",
    "как посчитать аванс от оклада",
    "как посчитать зарплату за неполный месяц",
    "калькулятор отпускных",
    "калькулятор больничного",
    "когда ндфл 15 процентов",
    "зарплата при увольнении",
    "компенсация отпуска при увольнении",
)


def nrm(q: str) -> str:
    q = (q or "").lower().replace("ё", "е")
    q = re.sub(r"[«»\"'`]", "", q)
    return re.sub(r"\s+", " ", q).strip()


def tokens(q: str) -> set[str]:
    return {t for t in re.findall(r"[а-яa-z0-9]+", nrm(q)) if len(t) > 1}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def slugify(q: str) -> str:
    out = []
    for ch in nrm(q):
        if ch in CYR:
            out.append(CYR[ch])
        elif ch.isalnum():
            out.append(ch)
        elif ch == " ":
            out.append("-")
    slug = re.sub(r"-+", "-", "".join(out)).strip("-")
    return slug[:48] or "tema"


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def suggest(part: str) -> list[str]:
    url = "https://suggest.yandex.ru/suggest-ya.cgi?" + urllib.parse.urlencode(
        {"v": "4", "part": part, "uil": "ru", "lr": "213"}
    )
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8", "replace")
        data = json.loads(raw)
    except Exception:
        return []
    if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list):
        return [str(x) for x in data[1] if isinstance(x, str)]
    return []


def live_queries() -> list[dict]:
    rows = []
    wm = load_json(RAW / "webmaster-live.json", {})
    for item in wm.get("queries") or []:
        if item.get("query"):
            rows.append(
                {
                    "q": item["query"],
                    "clicks": item.get("clicks") or 0,
                    "impressions": item.get("impressions") or 0,
                    "freq": 0,
                    "source": "webmaster-api",
                }
            )
    ws = load_json(RAW / "wordstat-live.json", {})
    for item in ws.get("queries") or []:
        q = item.get("query") or item.get("q") or ""
        if q:
            rows.append(
                {
                    "q": q,
                    "clicks": 0,
                    "impressions": 0,
                    "freq": item.get("freq") or 0,
                    "source": "wordstat-live",
                }
            )
    return rows


def evolving_seeds(clusters: list[dict]) -> list[str]:
    """Self-updating seed list: map + previous demand top + unmatched + fixed base."""
    seeds = list(SEEDS_EXTRA)
    for c in clusters:
        q = ((c.get("main") or {}).get("q") or "").strip()
        if q:
            seeds.append(q)
    prev = load_json(RAW / "demand.json", {})
    for row in (prev.get("queries") or [])[:25]:
        if row.get("q"):
            seeds.append(row["q"])
    for row in (prev.get("unmatched") or [])[:15]:
        if row.get("q"):
            seeds.append(row["q"])
    dyn = load_json(RAW / "seeds.json", {})
    for q in dyn.get("seeds") or []:
        if isinstance(q, str) and q.strip():
            seeds.append(q.strip())
    seen = set()
    out = []
    for s in seeds:
        k = nrm(s)
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(s)
    return out


def csv_queries() -> list[dict]:
    summary = load_json(RAW / "console-summary.json", {})
    rows = []
    pool = summary.get("queries") or summary.get("positions", {}).get("top") or []
    for item in pool:
        if item.get("query") or item.get("q"):
            rows.append(
                {
                    "q": item.get("query") or item.get("q"),
                    "clicks": item.get("clicks") or 0,
                    "impressions": item.get("impressions") or 0,
                    "freq": item.get("freq") or 0,
                    "source": "console",
                }
            )
    extra = load_json(RAW / "wordstat.json", {})
    for item in extra.get("queries") or []:
        rows.append(
            {
                "q": item.get("q") or item.get("query") or "",
                "clicks": 0,
                "impressions": 0,
                "freq": item.get("freq") or 0,
                "source": "wordstat-json",
            }
        )
    rows.extend(live_queries())
    return [r for r in rows if r["q"]]


def score(item: dict) -> float:
    return (
        float(item.get("clicks") or 0) * 1000
        + float(item.get("impressions") or 0)
        + float(item.get("freq") or 0) * 10
        + float(item.get("suggest") or 0)
    )


def numbers(q: str) -> set[str]:
    compact = re.sub(r"\s+", "", nrm(q))
    return set(re.findall(r"\d{5,}", compact))


def family(q: str) -> set[str]:
    n = nrm(q)
    tags = set()
    pairs = (
        ("аванс", "avans"),
        ("отпуск", "otp"),
        ("больнич", "bol"),
        ("ндфл", "ndfl"),
        ("ипотек", "ip"),
        ("бюджет", "bud"),
        ("зарплат", "zar"),
        ("оклад", "zar"),
        ("вычет", "ndfl"),
        ("ребен", "ndfl"),
        ("дет", "ndfl"),
        ("увольн", "uvol"),
        ("накопле", "nak"),
    )
    for word, tag in pairs:
        if word in n:
            tags.add(tag)
    return tags


def match_cluster(q: str, clusters: list[dict]) -> dict | None:
    qt = tokens(q)
    nq = nrm(q)
    qn = numbers(q)
    qf = family(q)
    best = None
    best_s = 0.0
    for c in clusters:
        cq = nrm((c.get("main") or {}).get("q") or "")
        if not cq:
            continue
        if nq == cq or nq in cq or cq in nq:
            return c
        if "otp" in family(q) and "otp" in family(cq):
            if ("неполн" in nq or "меньше года" in nq) and ("неполн" in cq or "год" in cq):
                return c
        cn = numbers(cq)
        if "otp" in qf and "otp" in family(cq):
            if ("2 недел" in nq or "двух недел" in nq) and ("14" in cq):
                return c
            if ("14" in nq) and ("14" in cq or "2 недел" in cq):
                return c
            if ("28" in nq or "4 недел" in nq) and ("28" in cq):
                return c
        cf = family(cq)
        if qn and cn and qn & cn and (not qf or qf & cf):
            return c
        s = jaccard(qt, tokens(cq))
        if qf and cf and qf & cf:
            s += 0.15
        if s > best_s:
            best, best_s = c, s
    if best is not None and best_s >= 0.45:
        return best
    return None


def is_tool_query(q: str) -> bool:
    n = nrm(q)
    return n.startswith("калькулятор") or n.endswith("калькулятор") or "калькулятор " in n[:20]


def collect(smap: dict | None = None, live: bool = True) -> dict:
    smap = smap or load_json(MAP_PATH, {"clusters": []})
    clusters = smap.get("clusters") or []
    uniq_seeds = evolving_seeds(clusters)

    bag: dict[str, dict] = {}

    def add(q: str, **kw):
        key = nrm(q)
        if len(key) < 8:
            return
        cur = bag.get(key) or {"q": q, "clicks": 0, "impressions": 0, "freq": 0, "suggest": 0, "sources": []}
        for field in ("clicks", "impressions", "freq", "suggest"):
            cur[field] = max(float(cur.get(field) or 0), float(kw.get(field) or 0))
        src = kw.get("source")
        if src and src not in cur["sources"]:
            cur["sources"].append(src)
        bag[key] = cur

    for row in csv_queries():
        add(row["q"], clicks=row["clicks"], impressions=row["impressions"], freq=row["freq"], source=row["source"])

    suggest_ok = 0
    if live:
        for seed in uniq_seeds[:36]:
            hints = suggest(seed)
            if hints:
                suggest_ok += 1
            add(seed, suggest=1, source="seed")
            for i, hint in enumerate(hints[:10]):
                add(hint, suggest=10 - i, source="yandex-suggest")
            time.sleep(0.12)

    queries = sorted(bag.values(), key=score, reverse=True)
    ranked = []
    unmatched = []
    for item in queries:
        c = match_cluster(item["q"], clusters)
        row = {
            "q": item["q"],
            "score": round(score(item), 1),
            "clicks": item["clicks"],
            "impressions": item["impressions"],
            "freq": item["freq"],
            "suggest": item["suggest"],
            "sources": item["sources"],
            "cluster": c["id"] if c else None,
            "page": c.get("page") if c else None,
            "status": c.get("status") if c else "new",
        }
        if c:
            ranked.append(row)
            # Self-update volume / demand score on the cluster
            main = c.setdefault("main", {})
            if item.get("freq"):
                main["vol"] = int(item["freq"])
            elif item.get("impressions"):
                main["vol_proxy"] = int(item["impressions"])
            c["demand"] = {
                "score": row["score"],
                "sources": item["sources"],
                "updated": date.today().isoformat(),
            }
        else:
            unmatched.append(row)

    # Soft-retire planned topics with no fact link for 45+ days
    retired = []
    for c in list(clusters):
        if c.get("status") != "planned":
            continue
        added_at = (c.get("demand") or {}).get("added") or (c.get("demand") or {}).get("updated")
        if not added_at:
            c.setdefault("demand", {})["added"] = date.today().isoformat()
            continue
        try:
            age = (date.today() - date.fromisoformat(str(added_at)[:10])).days
        except ValueError:
            continue
        if age < 45:
            continue
        # keep if facts attached
        facts = load_json(ROOT / "seo-agent" / "facts.json", {}).get("items") or []
        linked = any(c.get("id") in (f.get("used_by") or []) and f.get("status") == "verified" for f in facts)
        if linked:
            continue
        c["status"] = "retired"
        retired.append(c.get("id"))

    cap = int((load_json(ROOT / "seo-agent" / "config.json", {}) or {}).get("demandAddPlannedCap") or 2)
    added = []
    existing_pages = {c.get("page") for c in clusters}
    existing_ids = {c.get("id") for c in clusters}
    for item in unmatched:
        if len(added) >= cap:
            break
        q = item["q"]
        low = nrm(q)
        if any(s in low for s in STOP_NEW):
            continue
        if is_tool_query(q):
            continue
        if nrm(q).startswith("если "):
            continue
        if family(q) <= {"zar"} and not numbers(q) and "аванс" not in low and "увольн" not in low:
            continue
        if match_cluster(q, clusters):
            continue
        slug = slugify(q)
        page = f"/articles/{slug}.html"
        cid = slug.replace("-", "_")[:40]
        if page in existing_pages or cid in existing_ids:
            continue
        cluster = {
            "id": cid,
            "page": page,
            "status": "planned",
            "intent": "info",
            "main": {"q": q, "vol": item.get("freq") or None},
            "demand": {
                "score": item["score"],
                "sources": item["sources"],
                "added": date.today().isoformat(),
                "updated": date.today().isoformat(),
            },
        }
        clusters.append(cluster)
        existing_pages.add(page)
        existing_ids.add(cid)
        added.append({"id": cid, "q": q, "slug": slug})
        attach_fact(cid, q)
        item["cluster"] = cid
        item["status"] = "planned"

    smap["clusters"] = clusters
    smap["updated"] = date.today().isoformat()
    map_dirty = bool(added or retired)
    if map_dirty or any((c.get("demand") or {}).get("updated") == date.today().isoformat() for c in clusters):
        save_json(MAP_PATH, smap)

    by_id: dict[str, float] = {}
    for row in ranked + unmatched:
        cid = row.get("cluster")
        if cid:
            by_id[cid] = max(by_id.get(cid) or 0, row["score"])
    cluster_rank = sorted(by_id.items(), key=lambda x: x[1], reverse=True)

    # Rewrite evolving seed bank for next runs
    next_seeds = []
    for row in sorted(ranked + unmatched, key=lambda x: x["score"], reverse=True)[:40]:
        next_seeds.append(row["q"])
    for s in SEEDS_EXTRA:
        if s not in next_seeds:
            next_seeds.append(s)
    save_json(
        RAW / "seeds.json",
        {
            "updated": date.today().isoformat(),
            "note": "Автообновляется заводом. Семена следующего прогона = живой спрос.",
            "seeds": next_seeds[:50],
        },
    )

    wm = load_json(RAW / "webmaster-live.json", {})
    ws = load_json(RAW / "wordstat-live.json", {})
    report = {
        "updated": date.today().isoformat(),
        "note": (
            "Ранг: Вебмастер API (показы/клики) + Wordstat live/CSV + подсказки. "
            "Частотность Wordstat без ключа не выдумывается."
        ),
        "suggest_seeds_ok": suggest_ok,
        "webmaster_connected": bool(wm.get("connected")),
        "wordstat_connected": bool(ws.get("connected")),
        "queries": sorted(ranked + unmatched, key=lambda x: x["score"], reverse=True)[:80],
        "ranked": ranked[:40],
        "unmatched": unmatched[:40],
        "added_planned": added,
        "retired": retired,
        "cluster_rank": [{"id": i, "score": s} for i, s in cluster_rank],
    }
    save_json(OUT, report)
    return report


def main() -> int:
    live = "--offline" not in __import__("sys").argv
    rep = collect(live=live)
    print(
        json.dumps(
            {
                "suggest_seeds_ok": rep["suggest_seeds_ok"],
                "added": rep["added_planned"],
                "top": [x["q"] for x in (rep["queries"] or [])[:8]],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
