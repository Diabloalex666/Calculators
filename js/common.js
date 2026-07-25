function formatRub(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatRubPrecise(value, digits = 2) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(value * 100 % 1 === 0 ? 0 : 1).replace(".", ",")}%`;
}

function parseNumber(input) {
  const normalized = String(input).replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function bindCalculator(formId, handler) {
  const form = document.getElementById(formId);
  if (!form) return;

  const run = () => handler(form);
  form.addEventListener("input", run);
  form.addEventListener("change", run);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run();
  });
  run();
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function setHtml(id, html) {
  const node = document.getElementById(id);
  if (node) node.innerHTML = html;
}

function toggleFormFields(form, fieldName, visible) {
  const scope = form.closest(".panel") || form;
  scope.querySelectorAll(`[data-field="${fieldName}"]`).forEach((node) => {
    node.hidden = !visible;
  });
}

function renderStepsTable(steps) {
  if (!steps.length) {
    return '<p class="note">Нет данных для пошагового расчёта.</p>';
  }

  const rows = steps
    .map(
      (step) =>
        `<tr><td>${step.label}</td><td>${step.value}</td></tr>`
    )
    .join("");

  return `<table class="calc-steps"><thead><tr><th>Шаг</th><th>Значение</th></tr></thead><tbody>${rows}</tbody></table>`;
}
