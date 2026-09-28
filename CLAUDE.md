# FinPulse — индекс проекта

Сайт: https://finraz.ru/  
Стек: статический HTML на GitHub Pages (не Next.js: домен уже живой, переписывать каркас дороже, чем надстроить машину).  
Ниша: финансовые калькуляторы РФ (зарплата/НДФЛ, отпускные, больничный, ипотека, накопления, бюджет).  
Монетизация: РСЯ + Boosty. Заявки как у «Цех»-кейсов здесь нет — деньги с рекламы и донатов.

## Куда смотреть

| Что | Где |
|-----|-----|
| Контент калькуляторов | `salary.html`, `vacation.html`, `sick.html`, `mortgage.html`, `compound.html`, `budget.html` |
| Блог | `articles/` (канонические URL), хаб `blog/` |
| Карта семантики | `seo-agent/semantic-map.json` |
| Эталон статьи | `docs/article-standard.md` |
| Стоп-лист | `docs/stop-list.md` |
| Журнал решений | `docs/changelog.md` |
| План сессии | `docs/plan.md` |
| Панель машины | `seo-agent/panel.html` |
| Публикация | не коммитить и не пушить без явной просьбы |

## Правила сессии

1. Начинай с этого файла, затем `docs/plan.md` и последний `docs/changelog.md`.
2. SEO-правки — по `seo-agent/semantic-map.json`: один интент = одна страница-владелец.
3. Новая статья: status `planned` → `reserved` → черновик → гейт `python scripts/quality-gate.py` → `published` + IndexNow.
4. Не выдумывай цифры (ставки НДФЛ, лимиты СФР, МРОТ). Нет источника — не пиши число.
5. Не залп: темп на старте — до 1–2 статей за прогон с вычиткой. Стоп-лист — `docs/stop-list.md`.

## Автомат (GitHub Actions)

Файл `.github/workflows/seo-machine.yml`: после пуша в `main` и каждый день в 08:15 МСК
проверяет, что сайт отвечает, пингует Яндекс (sitemap) и IndexNow (Яндекс/Bing).

Статьи **не пишет**. Без ключа модели это был бы спам.

Опционально: в GitHub Secrets `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` — короткий отчёт в Telegram.

## Запуск локально

```powershell
cd F:\AI\side-income
python -m http.server 8080
```

Панель: открой `seo-agent/panel.html` двойным кликом.
python scripts/machine.py — проверка живого сайта и пинг поиска (нужен залитый ключ IndexNow).
