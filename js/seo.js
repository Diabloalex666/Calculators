(function injectSeoSchema() {
  const SITE = "https://finraz.ru";
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const page = path.endsWith(".html") ? path : path === "" ? "/" : path;

  function addJsonLd(data) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  addJsonLd({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "FinPulse",
    url: SITE + "/",
    description: "Бесплатные финансовые калькуляторы: зарплата, отпускные, больничный, ипотека, накопления.",
    inLanguage: "ru-RU",
  });

  const crumbRoot = document.querySelector(".breadcrumb");
  if (crumbRoot) {
    const links = [...crumbRoot.querySelectorAll("a")];
    const items = links.map((link, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: link.textContent.trim(),
      item: link.href.startsWith("http") ? link.href : SITE + "/" + link.getAttribute("href").replace(/^\//, ""),
    }));
    const current = crumbRoot.querySelector("[aria-current='page']");
    if (current) {
      items.push({
        "@type": "ListItem",
        position: items.length + 1,
        name: current.textContent.trim(),
        item: SITE + page,
      });
    }
    if (items.length) {
      addJsonLd({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items,
      });
    }
  }

  if (page === "/" || page === "/index.html") {
    const cards = document.querySelectorAll(".grid .card");
    if (cards.length) {
      addJsonLd({
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Финансовые калькуляторы FinPulse",
        itemListElement: [...cards].map((card, i) => {
          const link = card.querySelector("a");
          const href = link?.getAttribute("href") || "";
          return {
            "@type": "ListItem",
            position: i + 1,
            name: card.querySelector("h2")?.textContent.trim(),
            url: href.startsWith("http") ? href : SITE + "/" + href.replace(/^\//, ""),
          };
        }),
      });
    }
  }

  const appName = document.querySelector("h1");
  if (appName && page !== "/" && page !== "/index.html") {
    addJsonLd({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: appName.textContent.trim(),
      url: SITE + page,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
      inLanguage: "ru-RU",
    });
  }

  const faqItems = document.querySelectorAll(".faq-item");
  if (faqItems.length) {
    addJsonLd({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [...faqItems].map((item) => ({
        "@type": "Question",
        name: item.querySelector("h3")?.textContent.trim(),
        acceptedAnswer: {
          "@type": "Answer",
          text: item.querySelector("p")?.textContent.trim(),
        },
      })),
    });
  }
})();
