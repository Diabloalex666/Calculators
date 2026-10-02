#!/usr/bin/env python3
"""Live Yandex data: Webmaster popular queries + optional Wordstat via XMLRiver.

Secrets never go into the repo. Read from env or local .env (gitignored):
  YANDEX_WEBMASTER_TOKEN
  YANDEX_WEBMASTER_HOST_ID   (optional; auto-detect finraz.ru)
  XMLRIVER_USER              (optional Wordstat proxy)
  XMLRIVER_KEY
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "seo-agent" / "raw"
SITE = "https://finraz.ru"
UA = {"User-Agent": "FinPulseYandex/1.0"}
API = "https://api.webmaster.yandex.net/v4"


def load_dotenv() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = val


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def http_json(url: str, headers: dict, method: str = "GET", body: bytes | None = None):
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def webmaster_token() -> str:
    load_dotenv()
    return (os.environ.get("YANDEX_WEBMASTER_TOKEN") or "").strip()


def webmaster_headers() -> dict:
    token = webmaster_token()
    if not token:
        return {}
    return {
        "Authorization": f"OAuth {token}",
        "Accept": "application/json",
        **UA,
    }


def get_user_id(headers: dict) -> int | None:
    try:
        data = http_json(f"{API}/user", headers)
        return int(data.get("user_id"))
    except Exception as exc:
        print(f"webmaster user_id skip: {exc}")
        return None


def pick_host_id(headers: dict, user_id: int) -> str | None:
    forced = (os.environ.get("YANDEX_WEBMASTER_HOST_ID") or "").strip()
    if forced:
        return forced
    try:
        data = http_json(f"{API}/user/{user_id}/hosts", headers)
    except Exception as exc:
        print(f"webmaster hosts skip: {exc}")
        return None
    hosts = data.get("hosts") or []
    prefer = []
    for h in hosts:
        hid = h.get("host_id") or ""
        ascii_url = (h.get("ascii_host_url") or h.get("unicode_host_url") or "").lower()
        if "finraz.ru" in ascii_url or "finraz.ru" in hid:
            prefer.append(hid)
    return prefer[0] if prefer else ((hosts[0].get("host_id") if hosts else None) or None)


def fetch_webmaster_popular(limit: int = 500) -> dict:
    headers = webmaster_headers()
    out = {
        "updated": date.today().isoformat(),
        "connected": False,
        "source": "webmaster-api",
        "queries": [],
        "error": None,
        "user_id": None,
        "host_id": None,
    }
    if not headers:
        out["error"] = "нет YANDEX_WEBMASTER_TOKEN"
        save_json(RAW / "webmaster-live.json", out)
        return out
    user_id = get_user_id(headers)
    if not user_id:
        out["error"] = "не удалось получить user_id"
        save_json(RAW / "webmaster-live.json", out)
        return out
    host_id = pick_host_id(headers, user_id)
    if not host_id:
        out["error"] = "host_id не найден (добавь сайт в Вебмастер или YANDEX_WEBMASTER_HOST_ID)"
        out["user_id"] = user_id
        save_json(RAW / "webmaster-live.json", out)
        return out
    params = (
        "order_by=TOTAL_SHOWS"
        "&query_indicator=TOTAL_SHOWS"
        "&query_indicator=TOTAL_CLICKS"
        "&query_indicator=AVG_SHOW_POSITION"
        f"&limit={min(500, max(1, limit))}"
    )
    url = f"{API}/user/{user_id}/hosts/{urllib.parse.quote(host_id, safe='')}/search-queries/popular?{params}"
    try:
        data = http_json(url, headers)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")[:300]
        out["error"] = f"HTTP {exc.code}: {body}"
        out["user_id"] = user_id
        out["host_id"] = host_id
        save_json(RAW / "webmaster-live.json", out)
        return out
    except Exception as exc:
        out["error"] = str(exc)[:200]
        out["user_id"] = user_id
        out["host_id"] = host_id
        save_json(RAW / "webmaster-live.json", out)
        return out

    rows = []
    for item in data.get("queries") or []:
        text = (item.get("query_text") or "").strip()
        if not text:
            continue
        ind = item.get("indicators") or {}
        rows.append(
            {
                "query": text,
                "impressions": float(ind.get("TOTAL_SHOWS") or 0),
                "clicks": float(ind.get("TOTAL_CLICKS") or 0),
                "position": float(ind.get("AVG_SHOW_POSITION") or 0),
                "source": "webmaster-api",
            }
        )
    out.update(
        {
            "connected": True,
            "user_id": user_id,
            "host_id": host_id,
            "queries": rows,
            "date_from": data.get("date_from"),
            "date_to": data.get("date_to"),
            "count": data.get("count"),
        }
    )
    save_json(RAW / "webmaster-live.json", out)
    return out


def fetch_wordstat_xmlriver(phrases: list[str], cap: int = 20) -> dict:
    """Optional: XMLRiver Wordstat proxy. Without keys — empty, no crash."""
    load_dotenv()
    user = (os.environ.get("XMLRIVER_USER") or "").strip()
    key = (os.environ.get("XMLRIVER_KEY") or "").strip()
    out = {
        "updated": date.today().isoformat(),
        "connected": bool(user and key),
        "source": "xmlriver-wordstat",
        "queries": [],
        "error": None if (user and key) else "нет XMLRIVER_USER/XMLRIVER_KEY — Wordstat API пропускаем",
    }
    if not user or not key:
        save_json(RAW / "wordstat-live.json", out)
        return out
    rows = []
    for phrase in phrases[:cap]:
        params = urllib.parse.urlencode(
            {
                "user": user,
                "key": key,
                "query": phrase,
                "groupby": "10",
                "lr": "213",
                "device": "desktop",
            }
        )
        url = f"http://xmlriver.com/search_yandex/xml?{params}"
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as resp:
                xml = resp.read().decode("utf-8", "replace")
        except Exception as exc:
            out["error"] = str(exc)[:160]
            continue
        # <querypassages> / <found priority="all">N</found> patterns vary; take simple ws counts
        for m in re.finditer(
            r"<phrase[^>]*>(.*?)</phrase>.*?<ws>(\d+)</ws>",
            xml,
            flags=re.I | re.S,
        ):
            q = re.sub(r"<[^>]+>", "", m.group(1)).strip()
            freq = float(m.group(2))
            if q:
                rows.append({"query": q, "freq": freq, "source": "xmlriver-wordstat"})
        if not rows:
            found = re.search(r'found[^>]*priority="all"[^>]*>(\d+)<', xml, flags=re.I)
            if found:
                rows.append({"query": phrase, "freq": float(found.group(1)), "source": "xmlriver-wordstat"})
    out["queries"] = rows
    if rows:
        out["error"] = None
    save_json(RAW / "wordstat-live.json", out)
    return out


def encode_host_id(host_id: str) -> str:
    return urllib.parse.quote(host_id, safe=":")


def webmaster_context() -> dict:
    headers = webmaster_headers()
    if not headers:
        return {"headers": {}, "user_id": None, "host_id": None, "error": "нет YANDEX_WEBMASTER_TOKEN"}
    user_id = get_user_id(headers)
    if not user_id:
        return {"headers": headers, "user_id": None, "host_id": None, "error": "не удалось получить user_id"}
    host_id = pick_host_id(headers, user_id)
    if not host_id:
        return {"headers": headers, "user_id": user_id, "host_id": None, "error": "host_id не найден"}
    return {"headers": headers, "user_id": user_id, "host_id": host_id, "error": None}


def recrawl_quota(ctx: dict) -> dict:
    host = encode_host_id(ctx["host_id"])
    url = f"{API}/user/{ctx['user_id']}/hosts/{host}/recrawl/quota"
    return http_json(url, ctx["headers"])


def enqueue_recrawl(ctx: dict, page_url: str) -> dict:
    host = encode_host_id(ctx["host_id"])
    url = f"{API}/user/{ctx['user_id']}/hosts/{host}/recrawl/queue"
    body = json.dumps({"url": page_url}).encode("utf-8")
    headers = {**ctx["headers"], "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            payload = json.loads(resp.read().decode("utf-8", "replace") or "{}")
            return {"status": resp.status, "url": page_url, **payload}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"body": raw[:200]}
        return {"status": exc.code, "url": page_url, "error": payload}


def pull_all(seed_phrases: list[str] | None = None) -> dict:
    wm = fetch_webmaster_popular()
    seeds = seed_phrases or [
        "калькулятор зарплаты на руки",
        "калькулятор отпускных",
        "калькулятор больничного",
        "аванс от оклада",
        "ндфл 15 процентов",
    ]
    # Prefer top webmaster queries as Wordstat seeds when connected
    if wm.get("connected") and wm.get("queries"):
        seeds = [q["query"] for q in wm["queries"][:12]] + seeds
    # unique keep order
    seen = set()
    uniq = []
    for s in seeds:
        k = s.lower().strip()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(s)
    ws = fetch_wordstat_xmlriver(uniq)
    summary = {
        "updated": date.today().isoformat(),
        "webmaster": {
            "connected": wm.get("connected"),
            "error": wm.get("error"),
            "n": len(wm.get("queries") or []),
        },
        "wordstat": {
            "connected": ws.get("connected"),
            "error": ws.get("error"),
            "n": len(ws.get("queries") or []),
        },
    }
    save_json(RAW / "yandex-pull.json", summary)
    return {"webmaster": wm, "wordstat": ws, "summary": summary}


def main() -> int:
    rep = pull_all()
    print(json.dumps(rep["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
