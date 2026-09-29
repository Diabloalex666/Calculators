"""Refresh wrangler OAuth and deploy worker."""
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

# Wrangler public OAuth client (same as Cloudflare workers-sdk)
CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7"
CONFIG = Path.home() / "AppData/Roaming/xdg.config/.wrangler/config/default.toml"
ACCOUNT_ID = "fe4e0ea825d19beedd34f118f78c4885"
SCRIPT_NAME = "finpulse-feedback"
WORKER_FILE = Path(__file__).parent / "telegram-feedback.js"


def load_config() -> dict[str, str]:
    text = CONFIG.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    for key in ("oauth_token", "refresh_token", "expiration_time"):
        m = re.search(rf'{key}\s*=\s*"([^"]+)"', text)
        if m:
            out[key] = m.group(1)
    return out


def save_tokens(oauth: str, refresh: str, expiration: str) -> None:
    text = CONFIG.read_text(encoding="utf-8")
    text = re.sub(r'oauth_token\s*=\s*"[^"]*"', f'oauth_token = "{oauth}"', text)
    text = re.sub(r'refresh_token\s*=\s*"[^"]*"', f'refresh_token = "{refresh}"', text)
    text = re.sub(
        r'expiration_time\s*=\s*"[^"]*"', f'expiration_time = "{expiration}"', text
    )
    CONFIG.write_text(text, encoding="utf-8")


def refresh_oauth(refresh_token: str) -> dict:
    data = urllib.parse.urlencode(
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": CLIENT_ID,
        }
    ).encode()
    req = urllib.request.Request(
        "https://dash.cloudflare.com/oauth2/token",
        data=data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def deploy(token: str) -> None:
    script = WORKER_FILE.read_text(encoding="utf-8")
    metadata = {
        "main_module": "telegram-feedback.js",
        "compatibility_date": "2024-01-01",
        "bindings": [
            {"type": "secret_text", "name": "BOT_TOKEN"},
            {"type": "secret_text", "name": "CHAT_ID"},
        ],
    }
    boundary = "----FinPulseBoundary"
    body = b"".join(
        [
            f"--{boundary}\r\n".encode(),
            b'Content-Disposition: form-data; name="metadata"\r\n',
            b"Content-Type: application/json\r\n\r\n",
            json.dumps(metadata).encode(),
            b"\r\n",
            f"--{boundary}\r\n".encode(),
            b'Content-Disposition: form-data; name="telegram-feedback.js"; filename="telegram-feedback.js"\r\n',
            b"Content-Type: application/javascript+module\r\n\r\n",
            script.encode(),
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}"
        f"/workers/scripts/{SCRIPT_NAME}"
    )
    req = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            result = json.loads(resp.read().decode())
    except Exception as exc:
        # fallback: maybe secrets must be omitted from bindings on update
        if hasattr(exc, "read"):
            raise SystemExit(exc.read().decode()[:1000]) from exc
        raise
    if not result.get("success"):
        raise SystemExit(str(result)[:1000])
    print("OK deployed", SCRIPT_NAME)
    print("https://finpulse-feedback.finraz.workers.dev")


def main() -> None:
    cfg = load_config()
    print("refreshing oauth…")
    tokens = refresh_oauth(cfg["refresh_token"])
    access = tokens.get("access_token")
    refresh = tokens.get("refresh_token") or cfg["refresh_token"]
    expires_in = int(tokens.get("expires_in") or 3600)
    if not access:
        raise SystemExit("refresh failed: " + json.dumps(tokens)[:400])
    from datetime import datetime, timedelta, timezone

    exp = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    save_tokens(access, refresh, exp)
    print("oauth refreshed, deploying…")
    deploy(access)


if __name__ == "__main__":
    main()
