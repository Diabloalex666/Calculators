#!/usr/bin/env python3
"""Deploy FinPulse feedback worker to Cloudflare via API token."""
import json
import os
import sys
import urllib.request
from pathlib import Path

WORKER_DIR = Path(__file__).parent
SCRIPT_NAME = "finpulse-feedback"
WORKER_FILE = WORKER_DIR / "telegram-feedback.js"


def deploy(account_id: str, api_token: str, bot_token: str, chat_id: str) -> str:
    script = WORKER_FILE.read_text(encoding="utf-8")
    metadata = {
        "main_module": "telegram-feedback.js",
        "compatibility_date": "2024-01-01",
        "bindings": [
            {"type": "plain_text", "name": "BOT_TOKEN", "text": bot_token},
            {"type": "plain_text", "name": "CHAT_ID", "text": chat_id},
        ],
    }

    boundary = "----FinPulseBoundary"
    body = b""
    body += f"--{boundary}\r\n".encode()
    body += b'Content-Disposition: form-data; name="metadata"\r\n'
    body += b"Content-Type: application/json\r\n\r\n"
    body += json.dumps(metadata).encode("utf-8")
    body += b"\r\n"
    body += f"--{boundary}\r\n".encode()
    body += (
        b'Content-Disposition: form-data; name="telegram-feedback.js"; '
        b'filename="telegram-feedback.js"\r\n'
    )
    body += b"Content-Type: application/javascript+module\r\n\r\n"
    body += script.encode("utf-8")
    body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{SCRIPT_NAME}"
    req = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read().decode())

    if not result.get("success"):
        raise RuntimeError(json.dumps(result, ensure_ascii=False))

    # Enable workers.dev subdomain
    sub_url = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/workers/scripts/{SCRIPT_NAME}/subdomain"
    )
    sub_req = urllib.request.Request(
        sub_url,
        data=json.dumps({"enabled": True}).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(sub_req, timeout=30) as resp:
            sub_result = json.loads(resp.read().decode())
        subdomain = sub_result.get("result", {}).get("subdomain", "")
    except Exception:
        subdomain = ""

    if subdomain:
        return f"https://{SCRIPT_NAME}.{subdomain}.workers.dev"
    return f"https://{SCRIPT_NAME}.<your-subdomain>.workers.dev"


if __name__ == "__main__":
    account_id = os.environ.get("CF_ACCOUNT_ID", "")
    api_token = os.environ.get("CF_API_TOKEN", "")
    bot_token = os.environ.get("BOT_TOKEN", "")
    chat_id = os.environ.get("CHAT_ID", "682432911")

    if len(sys.argv) >= 4:
        account_id, api_token, bot_token = sys.argv[1:4]
        chat_id = sys.argv[4] if len(sys.argv) > 4 else chat_id

    if not all([account_id, api_token, bot_token]):
        print("Usage: CF_ACCOUNT_ID=... CF_API_TOKEN=... BOT_TOKEN=... python deploy-cloudflare.py")
        print("   or: python deploy-cloudflare.py ACCOUNT_ID API_TOKEN BOT_TOKEN [CHAT_ID]")
        sys.exit(1)

    worker_url = deploy(account_id, api_token, bot_token, chat_id)
    print(worker_url)
