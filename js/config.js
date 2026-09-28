(function redirectGithubPagesMirror() {
  var host = location.hostname;
  if (host !== "diabloalex666.github.io" && host !== "www.finraz.ru") return;
  var path = location.pathname.replace(/^\/Calculators\/?/, "/");
  if (!path) path = "/";
  location.replace("https://finraz.ru" + path + location.search + location.hash);
})();

// Настройки сайта FinPulse — https://finraz.ru/
window.FINPULSE_CONFIG = {
  siteUrl: "https://finraz.ru/",
  boostyUrl: "https://boosty.to/alexeyvasilev/donate",
  yandexMetrikaId: "109961609",
  googleSearchConsoleVerification: "",
  yandexWebmasterVerification: "",
  indexNowKey: "a8c3e17f6b924d0ea51c8f2d9b4e60c1",

  // РСЯ Autoplacement (из кабинета Яндекса)
  yandexAutoplacementPageId: "19466291",

  // Старый формат блоков R-A-... (не нужен при Autoplacement)
  rsyaBlockId: "",

  // URL Cloudflare Worker (обратная связь → Telegram)
  feedbackEndpoint: "https://finpulse-feedback.finraz.workers.dev",
};
