# Security — FinPulse (finraz.ru)

Дата аудита: 2026-10-12  
Стек: статический GitHub Pages + Cloudflare Worker (форма).  
Ориентир: применимые домены из [Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills) (web / XSS / secrets / CSP) — не весь каталог и не атакующие скиллы.

## Вердикт

Сайт без своей базы. Калькуляторы считаются в браузере. Повторный прогон 2026-10-12 закрыл дыры в нашем коде. HTTP-заголовки HSTS, `X-Frame-Options` и `nosniff` по-прежнему нельзя выставить: GitHub Pages их не отдаёт, а DNS зоны оставлен серым облаком специально, чтобы трафик посетителей не шёл через Cloudflare.

| Находка | Риск | Статус |
|---------|------|--------|
| Имя статьи бюджета попадало в HTML из localStorage | XSS в своём браузере | закрыто: поля собираются через DOM, имя не вставляется в разметку |
| Вебвизор записывал ввод в калькуляторы и форму | утечка сумм и текста обращения в Метрику | закрыто: `webvisor: false`, поля помечены `ym-disable-keys` |
| Worker верил заголовку Content-Length | слишком большое тело доходило до разбора | закрыто: чтение обрывается на 32 КБ |
| Редирект с github.io собирал адрес из пути как есть | увод на другой сайт при кривом пути | закрыто: путь, query и hash проверяются |
| Нет CSP / referrer meta | XSS / утечка URL | закрыто meta CSP + referrer (ещё 2026-09-29) |
| Нет HSTS / X-Frame-Options / nosniff как HTTP-заголовков | clickjacking, подмена типа | открыто, пока страницы не за прокси |
| `frame-ancestors` в meta-CSP браузер игнорирует | то же, что без заголовка | открыто вместе с прокси |
| `seo-agent/`, `scripts/`, `worker/` на Pages | утечка панели | закрыто, 2026-10-12 снова 404 |
| Секреты в git | высокий | токенов в публичных файлах нет; IndexNow-ключ публичный по протоколу |

## Повторный прогон 2026-10-12

Проверено снаружи:

- `https://finraz.ru/seo-agent/panel.html`, `facts.json`, `worker/telegram-feedback.js`, `docs/SECURITY.md`, `scripts/quality-gate.py`, `.env`, `.git/HEAD` — 404.
- Те же закрытые пути на `diabloalex666.github.io/Calculators/` — 404.
- Ответ `https://finraz.ru/` без CSP, HSTS, `X-Frame-Options`, `nosniff`. CSP остаётся в meta страницы.
- Форма шлёт только `message`, `contact`, `page`. Адрес посетителя не читается.
- Чужой `Origin` на Worker — 403.

Оранжевое облако не включалось.

## Что сделать тебе

Ничего по этому прогону. Прокси и платный Workers не нужны для закрытых пунктов. Письмо с формы уходит оператору через Cloudflare Email Routing и не содержит адрес посетителя. Общий ящик на все адреса домена не включён.
