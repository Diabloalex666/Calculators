function calcSalary(form) {
  const gross = parseNumber(form.gross.value);
  const rate = Number(form.rate.value);
  const net = gross * (1 - rate);
  const tax = gross - net;
  const yearly = gross * 12;

  setText("salary-net", formatRub(net));
  setText("salary-tax", formatRub(tax));
  setText("salary-gross", formatRub(gross));
  setText("salary-year", formatRub(yearly));
}

function calcVacation(form) {
  const income = parseNumber(form.income.value);
  const days = parseNumber(form.days.value) || 0;
  const avgDaily = income / 12 / 29.3;
  const pay = avgDaily * days;

  setText("vacation-daily", formatRub(avgDaily));
  setText("vacation-total", formatRub(pay));
}

function calcCompound(form) {
  const start = parseNumber(form.start.value);
  const monthly = parseNumber(form.monthly.value);
  const rate = parseNumber(form.rate.value) / 100 / 12;
  const months = parseNumber(form.months.value);

  let balance = start;
  for (let i = 0; i < months; i += 1) {
    balance = balance * (1 + rate) + monthly;
  }

  const invested = start + monthly * months;
  const profit = balance - invested;

  setText("compound-total", formatRub(balance));
  setText("compound-invested", formatRub(invested));
  setText("compound-profit", formatRub(profit));
}

function calcSick(form) {
  const income2y = parseNumber(form.income2y.value);
  const days = parseNumber(form.days.value) || 0;
  const rate = Number(form.rate.value);
  const avgDaily = income2y / 730;
  const pay = avgDaily * rate * days;

  setText("sick-daily", formatRub(avgDaily * rate));
  setText("sick-total", formatRub(pay));
  setText("sick-base", formatRub(avgDaily));
}

function calcMortgage(form) {
  const amount = parseNumber(form.amount.value);
  const annualRate = parseNumber(form.rate.value) / 100;
  const years = parseNumber(form.years.value) || 1;
  const months = years * 12;
  const monthlyRate = annualRate / 12;

  let payment = 0;
  if (monthlyRate === 0) {
    payment = amount / months;
  } else {
    const factor = (1 + monthlyRate) ** months;
    payment = (amount * monthlyRate * factor) / (factor - 1);
  }

  const total = payment * months;
  const overpay = total - amount;

  setText("mortgage-payment", formatRub(payment));
  setText("mortgage-total", formatRub(total));
  setText("mortgage-overpay", formatRub(overpay));
}

document.addEventListener("DOMContentLoaded", () => {
  bindCalculator("salary-form", calcSalary);
  bindCalculator("vacation-form", calcVacation);
  bindCalculator("compound-form", calcCompound);
  bindCalculator("sick-form", calcSick);
  bindCalculator("mortgage-form", calcMortgage);
});
