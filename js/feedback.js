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

  const config = window.FINPULSE_CONFIG || {};
  const endpoint = config.feedbackEndpoint;
  const mailTo = "Diabloalex666@mail.ru";

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

  async function sendFeedbackMail(message, contact, page) {
    const payload = {
      _subject: "FinPulse — обратная связь",
      _template: "box",
      _captcha: "false",
      _honey: "",
      page,
      message,
      contact: contact || "не указан",
    };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) payload._replyto = contact;

    const response = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(mailTo), {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || String(data.success) !== "true") {
      throw new Error("mail failed");
    }
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
    const message = sanitizeText(rawMessage, 4000);
    const contact = sanitizeText(rawContact, 100);

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

    const page = sanitizePage(window.location.pathname);

    try {
      await sendFeedbackMail(message, contact, page);
      try {
        await fetch(endpoint, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, contact, page }),
        });
      } catch {
        /* Telegram необязателен: полный текст уже ушёл на почту. */
      }

      form.reset();
      setStatus("Спасибо! Сообщение отправлено.", "success");
    } catch {
      setStatus("Не удалось отправить. Попробуйте позже.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
