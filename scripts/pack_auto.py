#!/usr/bin/env python3
"""Build a pack JSON from verified facts + cluster query. No invented rates."""
from __future__ import annotations

from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "seo-agent" / "packs"
ARTICLES = ROOT / "articles"

CALC = {
    "/salary.html": ("../salary.html", "Калькулятор зарплаты"),
    "/vacation.html": ("../vacation.html", "Калькулятор отпускных"),
    "/sick.html": ("../sick.html", "Калькулятор больничного"),
    "/mortgage.html": ("../mortgage.html", "Калькулятор ипотеки"),
    "/compound.html": ("../compound.html", "Калькулятор накоплений"),
    "/budget.html": ("../budget.html", "Шаблон бюджета"),
}


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


def related_for(owner: str, skip: str) -> list[dict]:
    out = []
    for path in sorted(ARTICLES.glob("*.html")):
        if path.name in {"index.html", skip}:
            continue
        html = path.read_text(encoding="utf-8")
        if Path(owner).name not in html:
            continue
        m = None
        for line in html.splitlines():
            if "<h1>" in line:
                m = line.split("<h1>", 1)[1].split("</h1>", 1)[0].strip()
                break
        out.append({"href": path.name, "label": m or path.stem})
        if len(out) >= 3:
            break
    return out


def build(cluster: dict, fact: dict) -> dict:
    q = ((cluster.get("main") or {}).get("q") or cluster.get("id") or "расчёт").strip()
    stem = Path(cluster.get("page") or "article.html").name
    owner = owner_for(cluster)
    calc, calc_label = CALC.get(owner, ("../salary.html", "Калькулятор зарплаты"))
    h1 = q[:1].upper() + q[1:] if q else stem
    title = f"{q} в 2026 | FinPulse"
    desc = (
        f"{fact.get('value')}. {fact.get('law')}. Пример без выдуманных ставок и ссылка на калькулятор."
    )
    if len(desc) > 250:
        desc = desc[:247] + "…"
    law = fact.get("law") or ""
    value = fact.get("value") or ""
    source = fact.get("source") or "https://www.consultant.ru/"
    body = (
        f"        <p>\n"
        f"          По норме ({law}) действует так: {value}.\n"
        f"          Это не «калькулятор вместо бухгалтера»: табель, премии и районный коэффициент\n"
        f"          меняют сумму. Свою цифру на руки проверьте в\n"
        f"          <a href=\"{calc}\">{calc_label.lower()}</a>.\n"
        f"        </p>\n\n"
        f"        <h2>Что брать за основу</h2>\n"
        f"        <p class=\"article-formula\">{value}</p>\n"
        f"        <p>\n"
        f"          Ставки НДФЛ и лимиты года здесь не подставляем, если их нет в карточке факта.\n"
        f"          Источник нормы — ссылка ниже, дата проверки на странице «Обновлено».\n"
        f"        </p>\n\n"
        f"        <h2>Как не перепутать с соседним расчётом</h2>\n"
        f"        <ul>\n"
        f"          <li>Аванс — выплата за первую половину месяца, долю ТК не фиксирует как 50%.</li>\n"
        f"          <li>Неполный месяц — в табеле меньше рабочих дней, чем в графике.</li>\n"
        f"          <li>Отпускные считают по среднему заработку, не делением оклада на 30.</li>\n"
        f"        </ul>\n"
    )
    return {
        "cluster_id": cluster.get("id"),
        "slug": stem,
        "date": date.today().isoformat(),
        "title": title,
        "description": desc,
        "h1": h1,
        "headline": h1,
        "crumb": h1[:28],
        "ogTitle": f"{h1} — FinPulse",
        "ogDescription": desc,
        "lead": f"{value}. Дальше — как это читать в расчётном листке и где посчитать на руки.",
        "calc": calc,
        "calcLabel": calc_label,
        "cta": "Откройте калькулятор и подставьте свой оклад. Норма в статье — рамка, не замена листку.",
        "note": "Расчёт справочный. Сверяйте с трудовым договором и актуальной редакцией нормы.",
        "body": body,
        "faqs": [
            {
                "q": "Можно ли считать это официальным расчётом?",
                "a": "Нет. Это справка по открытой норме. Кадры и бухгалтерия считают по табелю и ЛНА.",
            },
            {
                "q": "Где получить сумму на руки?",
                "a": f"В {calc_label.lower()} FinPulse. Ставку налога в текст не подставляем без карточки факта.",
            },
        ],
        "sources": [{"href": source, "label": law or "Первоисточник", "note": value}],
        "related": related_for(owner, stem),
    }


def ensure(cluster: dict, fact: dict) -> Path | None:
    stem = Path(cluster.get("page") or "").name
    if not stem.endswith(".html"):
        return None
    PACKS.mkdir(parents=True, exist_ok=True)
    path = PACKS / f"{Path(stem).stem}.json"
    if path.exists():
        return path
    import json

    pack = build(cluster, fact)
    path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path
