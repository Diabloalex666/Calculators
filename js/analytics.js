(function initFinPulse() {
  const config = window.FINPULSE_CONFIG || {};
  const CONSENT_KEY = "finpulse_cookie_consent";

  document.querySelectorAll("[data-boosty-link]").forEach((node) => {
    if (config.boostyUrl) node.href = config.boostyUrl;
  });

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
    if (config.yandexMetrikaId) {
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

      window.ym(config.yandexMetrikaId, "init", {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        webvisor: true,
      });

      const noscript = document.createElement("noscript");
      noscript.innerHTML = `<div><img src="https://mc.yandex.ru/watch/${config.yandexMetrikaId}" style="position:absolute;left:-9999px" alt="" /></div>`;
      document.body.appendChild(noscript);
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

    slots.forEach((slot) => {
      const renderId = `yandex_rtb_${config.rsyaBlockId.replace(/-/g, "_")}`;
      slot.innerHTML = `<div id="${renderId}"></div>`;
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
    bar.setAttribute("aria-label", "Согласие на cookie");
    bar.innerHTML = `
      <p class="cookie-banner__text">
        Мы используем cookie для аналитики (Яндекс.Метрика) и показа рекламы (РСЯ).
        Подробнее — <a href="privacy.html">политика конфиденциальности</a>.
      </p>
      <button type="button" class="cookie-banner__btn">Принять</button>
    `;

    bar.querySelector(".cookie-banner__btn").addEventListener("click", () => {
      localStorage.setItem(CONSENT_KEY, "1");
      bar.remove();
      initTracking();
    });

    document.body.appendChild(bar);
  }

  if (localStorage.getItem(CONSENT_KEY)) {
    initTracking();
  } else {
    showCookieBanner();
  }
})();
