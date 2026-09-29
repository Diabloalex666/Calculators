#!/usr/bin/env python3
"""Notify when article conveyor is empty: GitHub Issue (no Telegram).

Reads seo-agent/raw/conveyor-alert.json (written by factory.py).
Creates one open issue with label conveyor-empty; closes it when conveyor fills.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALERT = ROOT / "seo-agent" / "raw" / "conveyor-alert.json"
LABEL = "conveyor-empty"
TITLE = "FinPulse: конвейер статей пуст"


def load_alert() -> dict:
    if not ALERT.exists():
        return {"empty": False, "message": "нет conveyor-alert.json — сначала factory.py"}
    return json.loads(ALERT.read_text(encoding="utf-8"))


def gh(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["gh", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def open_issues() -> list[dict]:
    r = gh(
        "issue",
        "list",
        "--state",
        "open",
        "--label",
        LABEL,
        "--json",
        "number,title",
        "--limit",
        "5",
    )
    if r.returncode != 0:
        print("gh list failed:", r.stderr.strip())
        return []
    try:
        return json.loads(r.stdout or "[]")
    except json.JSONDecodeError:
        return []


def ensure_label() -> None:
    gh("label", "create", LABEL, "--description", "Конвейер статей FinPulse пуст", "--color", "D93F0B")


def create_issue(alert: dict) -> None:
    ensure_label()
    body = f"""## Конвейер пуст

{alert.get("message") or ""}

| | |
|--|--|
| queue | {", ".join(alert.get("queue") or []) or "—"} |
| ready packs | {", ".join(alert.get("ready_packs") or []) or "—"} |
| planned | {alert.get("planned")} |
| дата | {alert.get("updated")} |

### Что сделать
1. Открой чат с агентом FinPulse в Cursor.
2. Добавь пакет в `seo-agent/packs/` + verified в `facts.json` (или закрой planned без спроса).
3. После следующего прогона завода этот issue закроется сам.

blocked: `{json.dumps(alert.get("blocked") or [], ensure_ascii=False)}`
"""
    r = gh(
        "issue",
        "create",
        "--title",
        TITLE,
        "--label",
        LABEL,
        "--body",
        body,
    )
    print(r.stdout or r.stderr)


def close_issues(issues: list[dict]) -> None:
    for issue in issues:
        n = str(issue["number"])
        gh("issue", "close", n, "--comment", "Конвейер снова не пуст — закрываю автоматом.")
        print(f"closed #{n}")


def main() -> int:
    if not os.environ.get("GITHUB_ACTIONS") and "--force" not in sys.argv:
        print("skip: not in Actions (use --force to test locally with gh)")
        return 0
    alert = load_alert()
    issues = open_issues()
    if alert.get("empty"):
        if issues:
            print(f"already open: {[i['number'] for i in issues]}")
            return 0
        print("conveyor empty → create issue")
        create_issue(alert)
        return 0
    if issues:
        print("conveyor ok → close alert issues")
        close_issues(issues)
    else:
        print("conveyor ok, no alert issues")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
