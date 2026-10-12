(function initFinPulse() {
  const config = window.FINPULSE_CONFIG || {};
  const NOTICE_KEY = "finpulse_cookie_notice_v2";

  if (location.hostname.endsWith("github.io")) {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
  }

  document.querySelectorAll("[data-boosty-link]").forEach((node) => {
    if (typeof config.boostyUrl === "string" && config.boostyUrl.startsWith("https://")) {
      node.href = config.boostyUrl;
    }
  });

  if (config.googleSearchConsoleVerification) {
    const meta = document.createElement("meta");
    meta.name = "google-site-verification";
    meta.content = config.googleSearchConsoleVerification;
    document.head.appendChild(meta);
  }

  if (config.yandexWebmasterVerification) {
    const meta = document.createElement("meta");
    meta.name = "yandex-verification";
    meta.content = config.yandexWebmasterVerification;
    document.head.appendChild(meta);
  }

  function loadScript(src, attrs) {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    if (attrs) {
      Object.entries(attrs).forEach(([key, value]) => {
        script.setAttribute(key, value);
      });
    }
    document.head.appendChild(script);
  }

  function initTracking() {
    const metrikaId = String(config.yandexMetrikaId || "").replace(/[^\d]/g, "");
    if (metrikaId) {
      (function (m, e, t, r, i, k, a) {
        m[i] =
          m[i] ||
          function () {
            (m[i].a = m[i].a || []).push(arguments);
          };
        m[i].l = 1 * new Date();
        k = e.createElement(t);
        a = e.getElementsByTagName(t)[0];
        k.async = 1;
        k.src = r;
        a.parentNode.insertBefore(k, a);
      })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

      window.ym(metrikaId, "init", {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        webvisor: false,
      });

      const noscript = document.createElement("noscript");
      noscript.innerHTML = `<div><img src="https://mc.yandex.ru/watch/${metrikaId}" style="position:absolute;left:-9999px" alt="" /></div>`;
      document.body.appendChild(noscript);
    }

    const mailRuId = String(config.topMailRuCounterId || "").replace(/[^\d]/g, "");
    if (mailRuId && !document.getElementById("tmr-code")) {
      window._tmr = window._tmr || [];
      window._tmr.push({ id: mailRuId, type: "pageView", start: new Date().getTime() });
      const ts = document.createElement("script");
      ts.async = true;
      ts.id = "tmr-code";
      ts.src = "https://top-fwz1.mail.ru/js/code.js";
      const first = document.getElementsByTagName("script")[0];
      if (first && first.parentNode) first.parentNode.insertBefore(ts, first);
      else document.head.appendChild(ts);
    }

    if (config.yandexAutoplacementPageId) {
      loadScript("https://yandex.ru/ads/system/context.js");
      loadScript("https://yandex.ru/ads/system/ap-loader.js", {
        "data-page-id": config.yandexAutoplacementPageId,
      });
      return;
    }

    if (!config.rsyaBlockId) return;

    const slots = document.querySelectorAll("[data-rsya-slot]");
    if (!slots.length) return;

    const blockId = String(config.rsyaBlockId).replace(/[^A-Za-z0-9_-]/g, "");
    slots.forEach((slot) => {
      const renderId = `yandex_rtb_${blockId.replace(/-/g, "_")}`;
      const holder = document.createElement("div");
      holder.id = renderId;
      slot.replaceChildren(holder);
      window.yaContextCb = window.yaContextCb || [];
      window.yaContextCb.push(() => {
        window.Ya.Context.AdvManager.render({
          blockId: config.rsyaBlockId,
          renderTo: renderId,
        });
      });
    });

    loadScript("https://yandex.ru/ads/system/context.js");
  }

  function showCookieBanner() {
    if (document.querySelector(".cookie-banner")) return;

    const bar = document.createElement("div");
    bar.className = "cookie-banner";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Уведомление о cookie");
    bar.innerHTML = `
      <p class="cookie-banner__text">
        Используем cookie для статистики (Яндекс.Метрика), рекламы (РСЯ)
        и учёта переходов в VK Рекламе (счётчик Top.Mail.Ru).
        Подробнее — <a href="/privacy">политика конфиденциальности</a>.
      </p>
      <button type="button" class="cookie-banner__btn">Понятно</button>
    `;

    bar.querySelector(".cookie-banner__btn").addEventListener("click", () => {
      localStorage.setItem(NOTICE_KEY, "1");
      bar.remove();
    });

    document.body.appendChild(bar);
  }

  initTracking();
  if (!localStorage.getItem(NOTICE_KEY)) {
    showCookieBanner();
  }
})();
