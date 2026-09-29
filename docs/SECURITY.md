# Security — FinPulse (finraz.ru)

Дата аудита: 2026-09-29  
Стек: статический GitHub Pages + Cloudflare Worker (форма).  
Ориентир: применимые домены из [Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills) (web / XSS / secrets / rate-limit / CSP) — не «все 817 скиллов», а то, что бьёт в наш контур.

## Вердикт

Сайт **низкого серверного риска** (нет БД, калькуляторы в браузере), но были реальные слабости:

| Находка | Риск | Статус |
|---------|------|--------|
| Нет CSP / referrer meta | XSS / утечка URL | закрыто meta CSP + referrer |
| Нет HSTS / X-Frame-Options как HTTP-заголовков | MITM / clickjacking | **нужен Cloudflare/прокси** (GH Pages не даёт) |
| `seo-agent/`, `scripts/`, `worker/` отдавались с Pages | утечка панели/фактов/кода | закрыто: убран `.nojekyll` + `_config.yml` exclude + Actions whitelist |
| Feedback Worker без rate-limit и soft CORS | спам в Telegram / abuse | worker hardened |
| IndexNow key в репо | ожидаемо публичный | ок по протоколу IndexNow |
| Секреты в git | высокий | `.env` в gitignore; токены только Secrets |

## Что сделано в репо

1. `worker/telegram-feedback.js` — allowlist Origin, лимит тела, sanitize, rate-limit 5/мин по `CF-Connecting-IP`, безопасные ответы.
2. Удалён `.nojekyll` — иначе GitHub Pages отдаёт **весь** git-tree и игнорирует `_config.yml`.
3. `_config.yml` — Jekyll exclude: `seo-agent`, `scripts`, `worker`, `docs`, markdown-инструкции.
4. `.github/workflows/pages.yml` — whitelist-сборка `_site` (страховка; Source лучше = GitHub Actions).
5. CSP + referrer на публичных HTML (`scripts/stamp-security-meta.py` + `assemble.py`).
6. `robots.txt` Disallow на внутреннее; панель с `noindex`.
7. Этот файл — чеклист для повторного прогона.

## Что сделать тебе (разово)

```powershell
# 1) Задеплоить укреплённый Worker
cd F:\AI\side-income\worker
npx wrangler deploy
# секреты уже должны быть: BOT_TOKEN, CHAT_ID

# 2) После пуша main — проверить, что закрылось:
# https://finraz.ru/seo-agent/panel.html  → 404
# https://finraz.ru/seo-agent/facts.json → 404
```

3. **Рекомендация:** DNS finraz.ru через Cloudflare (Proxied) и Transform Rule:
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Permissions-Policy: geolocation=(), microphone=(), camera=()`

Без прокси GitHub Pages / Fastly эти заголовки **не выставить**.

## Повторный аудит (минимум)

- [ ] curl -sI https://finraz.ru/ | findstr /i "content-security\|strict-transport\|x-frame"
- [ ] seo-agent и scripts отдают 404
- [ ] POST на Worker с чужого Origin → 403
- [ ] 6+ POST с одного IP за минуту → 429
- [ ] Нет `.env` / токенов в git history свежих коммитов

## Вне скоупа (и не чиним «эксплойтом»)

Пентест чужих систем, обход капчи Яндекса, генерация malware, атаки на Telegram API — не делаем. Только hardening своего контура.
