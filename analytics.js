(function initFinPulse() {
  const config = window.FINPULSE_CONFIG || {};

  document.querySelectorAll("[data-boosty-link]").forEach((node) => {
    if (config.boostyUrl) node.href = config.boostyUrl;
  });

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

  if (!document.getElementById("yandex-rtb-context")) {
    const script = document.createElement("script");
    script.id = "yandex-rtb-context";
    script.src = "https://yandex.ru/ads/system/context.js";
    script.async = true;
    document.head.appendChild(script);
  }
})();
