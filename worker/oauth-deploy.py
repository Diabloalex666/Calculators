#!/usr/bin/env python3
"""Reliable Cloudflare OAuth (PKCE) + deploy finpulse-feedback Worker.

Bypasses flaky `wrangler login` callback. Opens browser, catches code on :8976,
saves tokens to wrangler config, uploads worker script.
"""
from __future__ import annotations

import base64
import hashlib
import http.server
import json
import re
import secrets
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone
from pathlib import Path

CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7"
REDIRECT = "http://localhost:8976/oauth/callback"
SCOPE = " ".join(
    [
        "account:read",
        "user:read",
        "workers:write",
        "workers_kv:write",
        "workers_routes:write",
        "workers_scripts:write",
        "workers_tail:read",
        "offline_access",
    ]
)
ACCOUNT_ID = "fe4e0ea825d19beedd34f118f78c4885"
SCRIPT_NAME = "finpulse-feedback"
WORKER_FILE = Path(__file__).parent / "telegram-feedback.js"
CONFIG = Path.home() / "AppData/Roaming/xdg.config/.wrangler/config/default.toml"

code_holder: dict[str, str] = {}


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        return

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/oauth/callback":
            self.send_response(404)
            self.end_headers()
            return
        qs = urllib.parse.parse_qs(parsed.query)
        if qs.get("code"):
            code_holder["code"] = qs["code"][0]
            body = b"<h1>OK</h1><p>Cloudflare auth caught. You can close this tab.</p>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            err = qs.get("error", ["unknown"])[0]
            body = f"<h1>Error</h1><pre>{err}</pre>".encode()
            self.send_response(400)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)
            code_holder["error"] = err


def free_port(port: int = 8976) -> None:
    try:
        import subprocess

        out = subprocess.check_output(["netstat", "-ano"], text=True, errors="ignore")
        for line in out.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                pid = line.split()[-1]
                if pid.isdigit():
                    subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
    except Exception:
        pass


def exchange(code: str, verifier: str) -> dict:
    data = urllib.parse.urlencode(
        {
            "grant_type": "authorization_code",
            "client_id": CLIENT_ID,
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": REDIRECT,
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


def save_tokens(access: str, refresh: str, expires_in: int) -> None:
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    exp = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).strftime(
        "%Y-%m-%dT%H:%M:%S.000Z"
    )
    if CONFIG.exists():
        text = CONFIG.read_text(encoding="utf-8")
        if "oauth_token" in text:
            text = re.sub(r'oauth_token\s*=\s*"[^"]*"', f'oauth_token = "{access}"', text)
            text = re.sub(
                r'refresh_token\s*=\s*"[^"]*"', f'refresh_token = "{refresh}"', text
            )
            text = re.sub(
                r'expiration_time\s*=\s*"[^"]*"', f'expiration_time = "{exp}"', text
            )
            CONFIG.write_text(text, encoding="utf-8")
            return
    CONFIG.write_text(
        "\n".join(
            [
                f'oauth_token = "{access}"',
                f'expiration_time = "{exp}"',
                f'refresh_token = "{refresh}"',
                "scopes = []",
                "",
            ]
        ),
        encoding="utf-8",
    )


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
            b'Content-Disposition: form-data; name="telegram-feedback.js"; '
            b'filename="telegram-feedback.js"\r\n',
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
    except urllib.error.HTTPError as exc:
        # Retry without secret bindings (keep whatever is already on CF)
        if exc.code in {400, 401, 403}:
            metadata["bindings"] = []
            body2 = b"".join(
                [
                    f"--{boundary}\r\n".encode(),
                    b'Content-Disposition: form-data; name="metadata"\r\n',
                    b"Content-Type: application/json\r\n\r\n",
                    json.dumps(metadata).encode(),
                    b"\r\n",
                    f"--{boundary}\r\n".encode(),
                    b'Content-Disposition: form-data; name="telegram-feedback.js"; '
                    b'filename="telegram-feedback.js"\r\n',
                    b"Content-Type: application/javascript+module\r\n\r\n",
                    script.encode(),
                    b"\r\n",
                    f"--{boundary}--\r\n".encode(),
                ]
            )
            req2 = urllib.request.Request(
                url,
                data=body2,
                method="PUT",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": f"multipart/form-data; boundary={boundary}",
                },
            )
            with urllib.request.urlopen(req2, timeout=90) as resp:
                result = json.loads(resp.read().decode())
        else:
            raise SystemExit(f"deploy {exc.code}: {exc.read().decode()[:800]}") from exc
    if not result.get("success"):
        raise SystemExit(json.dumps(result, ensure_ascii=False)[:800])
    print("DEPLOYED", SCRIPT_NAME)
    print("URL https://finpulse-feedback.finraz.workers.dev")


def main() -> None:
    import os
    import sys

    # Prefer API token: dash.cloudflare.com/oauth2/token is behind Turnstile
    # and returns 403 from many networks (same bug as wrangler login).
    api_token = (os.environ.get("CF_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN") or "").strip()
    if len(sys.argv) > 1 and sys.argv[1] not in {"--oauth", "-o"}:
        api_token = sys.argv[1].strip()
    if api_token:
        print("Deploying with API token…")
        deploy(api_token)
        return
    if "--oauth" not in sys.argv and "-o" not in sys.argv:
        raise SystemExit(
            "OAuth token endpoint is blocked by Cloudflare Turnstile (403).\n"
            "Create a token: https://dash.cloudflare.com/profile/api-tokens\n"
            "Template «Edit Cloudflare Workers», then:\n"
            "  set CF_API_TOKEN=... && python oauth-deploy.py\n"
            "  or: python oauth-deploy.py <API_TOKEN>"
        )

    free_port(8976)
    verifier = b64url(secrets.token_bytes(32))
    challenge = b64url(hashlib.sha256(verifier.encode()).digest())
    state = secrets.token_urlsafe(24)
    auth = (
        "https://dash.cloudflare.com/oauth2/auth?"
        + urllib.parse.urlencode(
            {
                "response_type": "code",
                "client_id": CLIENT_ID,
                "redirect_uri": REDIRECT,
                "scope": SCOPE,
                "state": state,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            }
        )
    )

    server = http.server.HTTPServer(("127.0.0.1", 8976), Handler)
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()
    print("Listening http://localhost:8976/oauth/callback")
    print("Open the browser, click Allow, wait for OK page…")
    webbrowser.open(auth)

    thread.join(timeout=180)
    server.server_close()

    if code_holder.get("error"):
        raise SystemExit("oauth error: " + code_holder["error"])
    if not code_holder.get("code"):
        raise SystemExit("timeout: no auth code (did the browser reach localhost:8976?)")

    print("Exchanging code…")
    try:
        tokens = exchange(code_holder["code"], verifier)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="ignore")[:200]
        raise SystemExit(
            f"token exchange {exc.code}: {body}\n"
            "Turnstile blocked OAuth. Use CF_API_TOKEN instead."
        ) from exc
    access = tokens.get("access_token")
    refresh = tokens.get("refresh_token") or ""
    expires_in = int(tokens.get("expires_in") or 3600)
    if not access:
        raise SystemExit("token exchange failed: " + json.dumps(tokens)[:400])
    save_tokens(access, refresh, expires_in)
    print("OAuth saved. Deploying worker…")
    deploy(access)


if __name__ == "__main__":
    main()
