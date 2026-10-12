(function initFeedback() {
  const form = document.getElementById("feedback-form");
  const status = document.getElementById("feedback-status");
  if (!form || !status) return;

  const MAX_MESSAGE = 4000;
  const MAX_CONTACT = 100;

  function attachCounter(field, max) {
    field.maxLength = max;
    const counter = document.createElement("p");
    counter.className = "feedback-count";
    counter.setAttribute("aria-live", "polite");
    field.insertAdjacentElement("afterend", counter);
    const update = () => {
      const length = field.value.length;
      counter.textContent = `${length} / ${max}`;
      counter.classList.toggle("is-full", length >= max);
    };
    field.addEventListener("input", update);
    form.addEventListener("reset", () => {
      setTimeout(update, 0);
    });
    update();
  }

  const messageField = form.querySelector('[name="message"]');
  const contactField = form.querySelector('[name="contact"]');
  if (messageField) attachCounter(messageField, MAX_MESSAGE);
  if (contactField) attachCounter(contactField, MAX_CONTACT);

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

  function setStatus(text, type) {
    status.textContent = text;
    status.className = `feedback-status${type ? ` feedback-status--${type}` : ""}`;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const honeypot = form.querySelector('[name="website"]');
    if (honeypot && honeypot.value.trim()) return;

    const rawMessage = form.querySelector('[name="message"]').value;
    const message = sanitizeText(rawMessage, 4000);

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

    setStatus("Форма скоро заработает. Попробуйте позже.", "error");
  });
})();
