# Выгрузки и живой API

Секреты в репозиторий не класть. Токены — GitHub Secrets или локальный `.env` (см. `YANDEX-API-SETUP.md`).

## Авто (предпочтительно)

Завод сам вызывает:

1. **Вебмастер API** → `webmaster-live.json` (нужен `YANDEX_WEBMASTER_TOKEN`)
2. **Подсказки Яндекса** → часть `demand.json`
3. **XMLRiver Wordstat** (если есть ключи) → `wordstat-live.json`

После токена CSV руками не обязательны.

## Ручной запасной путь (CSV)

Положи CSV в эту папку. Имена и колонки:

### Google Search Console
- Имя с `gsc`. Колонки: Query, Clicks, Impressions, Position.

### Яндекс.Вебмастер (CSV, если API ещё нет)
- Имя с `webmaster` или `yandex`. Колонки «Запрос», «Клики», «Показы», «Позиция».

### Яндекс.Wordstat
- Имя с `wordstat`. Колонки «Запрос» и «Частота».
- Быстрый срез на 10 фраз: шаблон `_wordstat-10-template.csv` + чеклист `wordstat-serp-10.md`.
- Файлы с `_` в начале ingest **не** читает — это черновики.
- После заполнения: `wordstat-10.csv` → `python scripts/ingest-console.py` → появится `wordstat.json` для цеха спроса.

### Метрика
- Имя с `metrika`. Колонка «Визиты».

Без файлов и без токена цех не падает: панель пишет, чего не хватает.

## Канал A (решение 2026-09-29)

**Основной путь частотностей — CSV из Wordstat**, не XMLRiver.  
XMLRiver (`XMLRIVER_USER` / `XMLRIVER_KEY`) остаётся опцией, если позже захочешь автобез ручной выгрузки.

