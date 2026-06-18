(function initFinPulse() {
  const config = window.FINPULSE_CONFIG || {};

  document.querySelectorAll("[data-boosty-link]").forEach((node) => {
    if (config.boostyUrl) node.href = config.boostyUrl;
  });

  if (config.yandexWebmasterVerification) {
    const meta = document.createElement("meta");
    meta.name = "yandex-verification";
    meta.content = config.yandexWebmasterVerification;
    document.head.appendChild(meta);
  }

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
})();
