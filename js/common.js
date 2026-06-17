function formatRub(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
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
