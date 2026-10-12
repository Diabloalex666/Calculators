// Потолок поля и результата: выше него Number теряет точность и строка рвёт вёрстку.
const INPUT_MONEY_CAP = 999_999_999_999;
const RESULT_MONEY_CAP = 999_999_999_999_999;

function formatTooBig() {
  return "слишком большое число";
}

function formatRub(value) {
  if (!Number.isFinite(value) || Math.abs(value) > RESULT_MONEY_CAP) return formatTooBig();
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatRubPrecise(value, digits = 2) {
  if (!Number.isFinite(value) || Math.abs(value) > RESULT_MONEY_CAP) return formatTooBig();
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

function capNumberInput(input) {
  if (!input || input.type !== "number") return;
  const fromAttr = input.max !== "" ? Number(input.max) : NaN;
  const max = Number.isFinite(fromAttr) ? fromAttr : INPUT_MONEY_CAP;
  const min = input.min !== "" ? Number(input.min) : NaN;
  const normalized = String(input.value).replace(/\s/g, "").replace(",", ".");
  if (normalized === "" || normalized === "-" || normalized === "." || normalized === "-.") return;
  const n = Number(normalized);
  if (n === Infinity || (Number.isFinite(n) && n > max)) {
    input.value = String(max);
    return;
  }
  if (Number.isFinite(min) && min > 0 && n > 0 && n < min) input.value = String(min);
}

function capNumericText(input) {
  if (!input || input.getAttribute("inputmode") !== "numeric") return;
  const normalized = String(input.value).replace(/\s/g, "").replace(",", ".");
  if (normalized === "" || normalized === "-" || normalized === "." || normalized === "-.") return;
  const n = Number(normalized);
  if (n === Infinity || (Number.isFinite(n) && n > INPUT_MONEY_CAP)) {
    input.value = String(INPUT_MONEY_CAP);
  }
}

function capControl(input) {
  if (!input || input.tagName !== "INPUT") return;
  if (input.type === "number") capNumberInput(input);
  else capNumericText(input);
}

function bindCalculator(formId, handler) {
  const form = document.getElementById(formId);
  if (!form) return;

  const run = () => {
    form.querySelectorAll("input").forEach(capControl);
    handler(form);
  };
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

document.addEventListener(
  "input",
  (event) => {
    capControl(event.target);
  },
  true
);
