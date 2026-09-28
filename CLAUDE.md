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

Файл `.github/workflows/seo-machine.yml`:

- пуш в `main` — гейт + IndexNow + пинг Яндекса;
- каждый день 08:15 МСК и суббота 07:00 МСК — то же плюс завод `python scripts/factory.py`;
- вручную: Actions → SEO machine → Run workflow.

Завод (10 систем гайда Васина, DIY на статике):

1. семантика — покрытие `semantic-map.json` vs файлы;
2. подготовка — брифы в `seo-agent/briefs/`;
3. написание — **не нейросеть**. Текст только из `seo-agent/queue/` после гейта;
4. анти-дубли — один интент / один title;
5. обложки — не генерируем (в Цехе);
6. публикация — дрип 1 файл/сутки из очереди + IndexNow;
7. мониторинг — живые URL из sitemap;
8. аудит — сироты, источники, CTA на калькулятор;
9. актуализация — статьи старше 120 дней;
10. советник — вердикт, чего не хватает, промпт дня.

Кап: `dailyArticleCap` 1. Дрип на GitHub: `publishQueue: true` и `FACTORY_DRIP=1`.
Тема без фактуры в `seo-agent/facts.json` в прод не идёт.

Статьи нейросеть сама не публикует: YMYL, стоп-лист, нет ключа модели в CI.

Опционально Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## Запуск локально

```powershell
cd F:\AI\side-income
python -m http.server 8080
```

Панель: открой `seo-agent/panel.html` двойным кликом.

```powershell
python scripts/quality-gate.py
python scripts/factory.py --offline
python scripts/machine.py
python scripts/factory.py --drip
```
