(function initFeedback() {
  const form = document.getElementById("feedback-form");
  const status = document.getElementById("feedback-status");
  if (!form || !status) return;

  const config = window.FINPULSE_CONFIG || {};
  const endpoint = config.feedbackEndpoint;

  /** Убирает HTML, управляющие символы и опасные фрагменты */
  function sanitizeText(input, maxLen) {
    return String(input || "")
      .replace(/\0/g, "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/javascript\s*:/gi, "")
      .replace(/data\s*:\s*text\/html/gi, "")
      .replace(/on\w+\s*=/gi, "")
      .trim()
      .slice(0, maxLen);
  }

  function sanitizePage(path) {
    const p = String(path || "/").slice(0, 200);
    return /^\/[\w\-./]*$/.test(p) ? p : "/";
  }

  function setStatus(text, type) {
    status.textContent = text;
    status.className = `feedback-status${type ? ` feedback-status--${type}` : ""}`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!endpoint) {
      setStatus("Форма скоро заработает. Попробуйте позже.", "error");
      return;
    }

    const honeypot = form.querySelector('[name="website"]');
    if (honeypot && honeypot.value.trim()) return;

    const rawMessage = form.querySelector('[name="message"]').value;
    const rawContact = form.querySelector('[name="contact"]').value;
    const message = sanitizeText(rawMessage, 2000);
    const contact = sanitizeText(rawContact, 120);

    if (message.length < 5) {
      setStatus("Напишите чуть подробнее (минимум 5 символов).", "error");
      return;
    }

    if ((message.match(/https?:\/\//gi) || []).length > 5) {
      setStatus("Слишком много ссылок в сообщении.", "error");
      return;
    }

    const consent = form.querySelector('[name="consent"]');
    if (consent && !consent.checked) {
      setStatus("Отметьте согласие на обработку данных.", "error");
      return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    setStatus("Отправляем…", "");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          contact,
          page: sanitizePage(window.location.pathname),
        }),
      });

      if (!response.ok) throw new Error("request failed");

      form.reset();
      setStatus("Спасибо! Сообщение отправлено.", "success");
    } catch {
      setStatus("Не удалось отправить. Попробуйте позже.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
