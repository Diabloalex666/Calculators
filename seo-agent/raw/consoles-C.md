# Консоли — блок C

Дата: 2026-09-29  
Цель: CSV в `seo-agent/raw/` → `python scripts/ingest-console.py` → панель видит клики/показы/визиты.

Вебмастер API уже живой. Wordstat CSV уже есть. Осталось GSC и (по желанию) Метрика.

---

## C1. Google Search Console

1. Открой [Search Console](https://search.google.com/search-console) → свойство `finraz.ru` (или `https://finraz.ru/`).
2. **Эффективность** → вкладка **Запросы**.
3. Период: последние 28 дней (или 3 месяца).
4. Экспорт → **Скачать CSV** (или «Строки»).
5. Сохрани файл как `seo-agent/raw/gsc-queries.csv`.

Нужные колонки (как в выгрузке GSC): `Query`, `Clicks`, `Impressions`, `CTR`, `Position`.

Если свойства ещё нет — добавь URL-префикс `https://finraz.ru/` и подтверди через DNS/HTML (у тебя уже может быть).

---

## C2. Яндекс.Метрика (опционально)

1. [Метрика](https://metrika.yandex.ru/) → счётчик finraz.ru.
2. Отчёт **Источники → Поисковые системы** или **Содержание → Популярное**.
3. Экспорт → CSV.
4. Сохрани как `seo-agent/raw/metrika-visits.csv` (в имени должно быть `metrika`).
5. В файле нужна колонка с визитами (`Визиты` / `Visits`).

Без Метрики панель всё равно живёт на Вебмастер API + Wordstat + GSC.

---

## C3. После файлов

```powershell
cd F:\AI\side-income
python scripts/ingest-console.py
python scripts/factory.py --offline
```

Проверка: в `seo-agent/raw/console-summary.json` есть клики/показы; панель не орёт только про GSC, если файл лежит.

---

## Чеклист

- [ ] C1 — `gsc-queries.csv` в raw/
- [ ] C2 — `metrika-*.csv` (или skip)
- [ ] C3 — ingest + панель ок
