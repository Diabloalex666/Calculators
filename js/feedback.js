(function initFeedback() {
  const form = document.getElementById("feedback-form");
  const status = document.getElementById("feedback-status");
  if (!form || !status) return;

  const config = window.FINPULSE_CONFIG || {};
  const endpoint = config.feedbackEndpoint;

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

    const message = form.querySelector('[name="message"]').value.trim();
    const contact = form.querySelector('[name="contact"]').value.trim();

    if (message.length < 5) {
      setStatus("Напишите чуть подробнее (минимум 5 символов).", "error");
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
          page: window.location.pathname || "/",
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
