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
| Разведка ниши | `seo-agent/razvedka-finpulse-2026-09-29.md` |
| Пакеты статей | `seo-agent/packs/` |
| Выгрузки консолей | `seo-agent/raw/` (CSV, см. HOW-TO.md) |
| Публикация | не коммитить и не пушить без явной просьбы |

## Правила сессии

1. Начинай с этого файла, затем `docs/plan.md` и последний `docs/changelog.md`.
2. SEO-правки — по `seo-agent/semantic-map.json`: один интент = одна страница-владелец.
3. Новая статья: status `planned` → пакет в `seo-agent/packs/` → завод собирает в `queue/` → гейт → `published` + IndexNow. Нейросеть в прод не пишет.
4. Не выдумывай цифры (ставки НДФЛ, лимиты СФР, МРОТ). Нет verified в `facts.json` — пакет не публикуется.
5. Не залп: кап 1 статья/сутки. Стоп-лист — `docs/stop-list.md`.

## Автомат (GitHub Actions)

Файл `.github/workflows/seo-machine.yml`:

- пуш в `main` — гейт + IndexNow + пинг Яндекса;
- каждый день 08:15 МСК и суббота 07:00 МСК — то же плюс завод `python scripts/factory.py`;
- вручную: Actions → SEO machine → Run workflow.

Завод (свои цеха, не пакет Васина):

1. семантика — покрытие `semantic-map.json` vs файлы;
2. брифы — заглушка на каждую planned-тему;
3. писатель — HTML из `seo-agent/packs/` в очередь, только при verified-фактах;
4. анти-дубли — один интент / один title;
5. обложки — не генерируем;
6. публикация — дрип 1 файл/сутки + IndexNow;
7. мониторинг — живые URL из sitemap;
8. аудит — сироты, источники, CTA на калькулятор;
9. актуализация — статьи старше 120 дней;
10. советник — вердикт и промпт дня;
11. консоли — CSV GSC/Вебмастер/Метрика/Wordstat → панель;
12. спрос — Вебмастер API + подсказки Яндекса (+ Wordstat XMLRiver опционально); семена самообновляются; planned кап 2/сутки; retired без фактуры >45 дней.

Кап: `dailyArticleCap` 1. Дрип и писатель: `publishQueue: true`, `tsekhWrite: true`, в Actions `FACTORY_DRIP=1` и `FACTORY_WRITE=1`.
Спрос: `demandSuggest: true`, `demandAddPlannedCap: 2`. Частотности Wordstat — только из API/CSV, иначе ранг по показам Вебмастера и подсказкам.

Секреты Actions (не в репо): `YANDEX_WEBMASTER_TOKEN`, опционально `YANDEX_WEBMASTER_HOST_ID`, `XMLRIVER_USER`, `XMLRIVER_KEY`. Инструкция: `seo-agent/raw/YANDEX-API-SETUP.md`.

Платный Цех Васина (64 механики, Wordstat/XMLRiver/Топвизор) не копируем. Telegram-алерты не требуются.

Локально: `python -m http.server 8080`. Панель — `seo-agent/panel.html`.

```powershell
python scripts/quality-gate.py --strict
python scripts/factory.py --offline --drip
python scripts/assemble.py avans-ot-oklada
python scripts/ingest-console.py
python scripts/machine.py
```
