const NDFL_BRACKETS_2026 = [
  { upTo: 2_400_000, rate: 0.13, label: "до 2,4 млн ₽" },
  { upTo: 5_000_000, rate: 0.15, label: "2,4–5 млн ₽" },
  { upTo: 20_000_000, rate: 0.18, label: "5–20 млн ₽" },
  { upTo: 50_000_000, rate: 0.2, label: "20–50 млн ₽" },
  { upTo: Infinity, rate: 0.22, label: "свыше 50 млн ₽" },
];

const SICK_LIMITS_2026 = {
  income2024: 2_225_000,
  income2025: 2_759_000,
  maxDaily: 6_827.4,
  minDaily: 890.73,
};

const EMPLOYER_CONTRIB_RATE = 0.3;

function childDeductionMonthly(children) {
  const count = Math.max(0, Math.min(6, Math.round(children)));
  if (count <= 0) return 0;
  if (count === 1) return 1_400;
  if (count === 2) return 2_800;
  return 2_800 + (count - 2) * 3_000;
}

function calcProgressiveNdfl(annualTaxable, breakdown) {
  let tax = 0;
  let prev = 0;

  for (const bracket of NDFL_BRACKETS_2026) {
    if (annualTaxable <= prev) break;
    const chunk = Math.min(annualTaxable, bracket.upTo) - prev;
    if (chunk <= 0) {
      prev = bracket.upTo;
      continue;
    }
    const part = chunk * bracket.rate;
    tax += part;
    if (breakdown) {
      breakdown.push({
        label: `НДФЛ ${formatPercent(bracket.rate)} (${bracket.label})`,
        value: `${formatRub(chunk)} × ${formatPercent(bracket.rate)} = ${formatRub(part)}`,
      });
    }
    prev = bracket.upTo;
  }

  return tax;
}

function salaryFromGross(gross, children, manualRate) {
  const deduction = childDeductionMonthly(children);
  const monthlyTaxable = Math.max(0, gross - deduction);

  if (manualRate != null) {
    const tax = monthlyTaxable * manualRate;
    return {
      gross,
      net: gross - tax,
      tax,
      monthlyTaxable,
      deduction,
      effectiveRate: gross > 0 ? tax / gross : 0,
      breakdown: [
        { label: "Оклад до НДФЛ", value: formatRub(gross) },
        { label: "Стандартный вычет на детей", value: deduction ? `− ${formatRub(deduction)}` : "нет" },
        { label: "База для НДФЛ", value: formatRub(monthlyTaxable) },
        {
          label: `НДФЛ ${formatPercent(manualRate)}`,
          value: `${formatRub(monthlyTaxable)} × ${formatPercent(manualRate)} = ${formatRub(tax)}`,
        },
        { label: "На руки", value: formatRub(gross - tax) },
      ],
    };
  }

  const annualTaxable = monthlyTaxable * 12;
  const ndflBreakdown = [];
  const annualTax = calcProgressiveNdfl(annualTaxable, ndflBreakdown);
  const monthlyTax = annualTax / 12;

  return {
    gross,
    net: gross - monthlyTax,
    tax: monthlyTax,
    monthlyTaxable,
    deduction,
    annualTaxable,
    annualTax,
    effectiveRate: gross > 0 ? monthlyTax / gross : 0,
    breakdown: [
      { label: "Оклад до НДФЛ", value: formatRub(gross) },
      { label: "Стандартный вычет на детей", value: deduction ? `− ${formatRub(deduction)}` : "нет" },
      { label: "База для НДФЛ в месяц", value: formatRub(monthlyTaxable) },
      { label: "Годовая база (× 12)", value: formatRub(annualTaxable) },
      ...ndflBreakdown,
      { label: "НДФЛ за год", value: formatRub(annualTax) },
      { label: "НДФЛ в месяц", value: formatRub(monthlyTax) },
      { label: "На руки", value: formatRub(gross - monthlyTax) },
    ],
  };
}

function grossFromNet(targetNet, children, manualRate) {
  let lo = targetNet;
  let hi = Math.max(targetNet * 1.5, targetNet + 10_000);

  while (salaryFromGross(hi, children, manualRate).net < targetNet && hi < 50_000_000) {
    hi *= 1.5;
  }

  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (salaryFromGross(mid, children, manualRate).net < targetNet) lo = mid;
    else hi = mid;
  }

  return Math.round((lo + hi) / 2);
}

function calcSalary(form) {
  const mode = form.mode.value;
  const taxMode = form.taxMode.value;
  const children = parseNumber(form.children.value);
  const manualRate = taxMode === "manual" ? Number(form.rate.value) : null;

  toggleFormFields(form, "gross", mode === "gross");
  toggleFormFields(form, "net", mode === "net");
  toggleFormFields(form, "manual-rate", taxMode === "manual");

  let gross = 0;
  if (mode === "gross") {
    gross = parseNumber(form.gross.value);
  } else {
    const targetNet = parseNumber(form.net.value);
    gross = grossFromNet(targetNet, children, manualRate);
  }

  const result = salaryFromGross(gross, children, manualRate);
  const employerContrib = gross * EMPLOYER_CONTRIB_RATE;

  setText("salary-net", formatRub(result.net));
  setText("salary-tax", formatRub(result.tax));
  setText("salary-gross", formatRub(result.gross));
  setText("salary-year", formatRub(result.gross * 12));
  setText("salary-deduction", result.deduction ? formatRub(result.deduction) : "—");
  setText(
    "salary-rate",
    taxMode === "manual" ? formatPercent(manualRate) : formatPercent(result.effectiveRate)
  );
  setText("salary-employer", formatRub(employerContrib));
  setHtml("salary-steps", renderStepsTable(result.breakdown));
}

function calcVacation(form) {
  const useMonthly = form.incomeMode.value === "monthly";
  toggleFormFields(form, "yearly-income", !useMonthly);
  toggleFormFields(form, "monthly-income", useMonthly);

  const monthsWorked = Math.max(1, Math.min(12, parseNumber(form.months.value) || 12));
  const days = parseNumber(form.days.value) || 0;

  let income = 0;
  if (useMonthly) {
    income = parseNumber(form.monthly.value) * monthsWorked;
  } else {
    income = parseNumber(form.income.value);
  }

  const avgDaily = income / monthsWorked / 29.3;
  const grossPay = avgDaily * days;
  const impliedMonthly = income / monthsWorked;
  const salaryContext = salaryFromGross(impliedMonthly, 0, null);
  const ndfl = grossPay * salaryContext.effectiveRate;
  const netPay = grossPay - ndfl;

  const steps = [
    { label: "Доход за расчётный период", value: formatRub(income) },
    { label: "Месяцев в расчёте", value: String(monthsWorked) },
    { label: "Средний дневной заработок", value: `${formatRub(income)} ÷ ${monthsWorked} ÷ 29,3 = ${formatRubPrecise(avgDaily)}` },
    { label: "Дней отпуска", value: String(days) },
    { label: "Отпускные до НДФЛ", value: `${formatRubPrecise(avgDaily)} × ${days} = ${formatRub(grossPay)}` },
    { label: "НДФЛ (по ставке от средней зарплаты)", value: `${formatRub(grossPay)} × ${formatPercent(salaryContext.effectiveRate)} = ${formatRub(ndfl)}` },
    { label: "На руки", value: formatRub(netPay) },
  ];

  setText("vacation-daily", formatRubPrecise(avgDaily));
  setText("vacation-total", formatRub(grossPay));
  setText("vacation-net", formatRub(netPay));
  setText("vacation-ndfl", formatRub(ndfl));
  setHtml("vacation-steps", renderStepsTable(steps));
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

function cappedSickIncome(form) {
  const splitYears = form.incomeMode.value === "split";

  toggleFormFields(form, "total-income", !splitYears);
  toggleFormFields(form, "split-income", splitYears);

  if (splitYears) {
    const y2024 = Math.min(parseNumber(form.income2024.value), SICK_LIMITS_2026.income2024);
    const y2025 = Math.min(parseNumber(form.income2025.value), SICK_LIMITS_2026.income2025);
    return {
      total: y2024 + y2025,
      capped2024: y2024,
      capped2025: y2025,
      wasCapped:
        parseNumber(form.income2024.value) > SICK_LIMITS_2026.income2024 ||
        parseNumber(form.income2025.value) > SICK_LIMITS_2026.income2025,
    };
  }

  const raw = parseNumber(form.income2y.value);
  const total = Math.min(raw, SICK_LIMITS_2026.income2024 + SICK_LIMITS_2026.income2025);
  return { total, capped2024: null, capped2025: null, wasCapped: raw > total };
}

function calcSick(form) {
  const days = parseNumber(form.days.value) || 0;
  const rate = Number(form.rate.value);
  const income = cappedSickIncome(form);

  let avgDaily = income.total / 730;
  const rawDaily = avgDaily;
  let limitedBy = "";

  if (avgDaily > SICK_LIMITS_2026.maxDaily) {
    avgDaily = SICK_LIMITS_2026.maxDaily;
    limitedBy = "max";
  } else if (avgDaily < SICK_LIMITS_2026.minDaily) {
    avgDaily = SICK_LIMITS_2026.minDaily;
    limitedBy = "min";
  }

  const dailyPay = avgDaily * rate;
  const pay = dailyPay * days;

  const steps = [
    { label: "Доход за 2 года (с учётом лимитов)", value: formatRub(income.total) },
  ];

  if (income.capped2024 != null) {
    steps.push(
      { label: "2024 год (лимит 2 225 000 ₽)", value: formatRub(income.capped2024) },
      { label: "2025 год (лимит 2 759 000 ₽)", value: formatRub(income.capped2025) }
    );
  }

  steps.push(
    { label: "Средний дневной заработок", value: `${formatRub(income.total)} ÷ 730 = ${formatRubPrecise(rawDaily)}` }
  );

  if (limitedBy === "max") {
    steps.push({
      label: "Лимит СФР 2026",
      value: `Применён максимум ${formatRubPrecise(SICK_LIMITS_2026.maxDaily)} / день`,
    });
  } else if (limitedBy === "min") {
    steps.push({
      label: "МРОТ 2026",
      value: `Применён минимум ${formatRubPrecise(SICK_LIMITS_2026.minDaily)} / день`,
    });
  }

  steps.push(
    { label: "Процент по стажу", value: formatPercent(rate) },
    { label: "Дневная выплата", value: `${formatRubPrecise(avgDaily)} × ${formatPercent(rate)} = ${formatRubPrecise(dailyPay)}` },
    { label: "Дней больничного", value: String(days) },
    { label: "Итого больничный", value: formatRub(pay) }
  );

  setText("sick-daily", formatRubPrecise(dailyPay));
  setText("sick-total", formatRub(pay));
  setText("sick-base", formatRubPrecise(avgDaily));
  setText(
    "sick-limit-note",
    limitedBy === "max"
      ? "Применён верхний лимит СФР"
      : limitedBy === "min"
        ? "Применён минимум по МРОТ"
        : income.wasCapped
          ? "Доход ограничен предельной базой"
          : "Без ограничений по лимиту"
  );
  setHtml("sick-steps", renderStepsTable(steps));
}

function annuityPayment(amount, monthlyRate, months) {
  if (months <= 0) return 0;
  if (monthlyRate === 0) return amount / months;
  const factor = (1 + monthlyRate) ** months;
  return (amount * monthlyRate * factor) / (factor - 1);
}

function simulateMortgage(amount, annualRate, years, extraPayment, extraMonth) {
  const months = years * 12;
  const monthlyRate = annualRate / 12;
  const payment = annuityPayment(amount, monthlyRate, months);

  function run(withExtra) {
    let balance = amount;
    let totalPaid = 0;
    let interestPaid = 0;
    let monthCount = 0;

    for (let month = 1; month <= months && balance > 0.01; month += 1) {
      const interest = balance * monthlyRate;
      let principal = payment - interest;

      if (withExtra && extraPayment > 0 && month === extraMonth) {
        principal += extraPayment;
      }

      if (principal > balance) principal = balance;

      balance -= principal;
      totalPaid += interest + principal;
      interestPaid += interest;
      monthCount = month;

      if (balance <= 0.01) break;
    }

    return { payment, totalPaid, interestPaid, monthCount };
  }

  const base = run(false);
  const early =
    extraPayment > 0 && extraMonth > 0 ? run(true) : null;

  return { base, early, monthlyRate, months };
}

function calcMortgage(form) {
  const amount = parseNumber(form.amount.value);
  const annualRate = parseNumber(form.rate.value) / 100;
  const years = parseNumber(form.years.value) || 1;
  const extraPayment = parseNumber(form.extra.value);
  const extraMonth = parseNumber(form.extraMonth.value);
  const useEarly = form.earlyMode.value === "on";

  toggleFormFields(form, "early", useEarly);

  const sim = simulateMortgage(amount, annualRate, years, extraPayment, extraMonth);
  const base = sim.base;

  setText("mortgage-payment", formatRub(base.payment));
  setText("mortgage-total", formatRub(base.totalPaid));
  setText("mortgage-overpay", formatRub(base.interestPaid));

  const steps = [
    { label: "Сумма кредита", value: formatRub(amount) },
    { label: "Ставка годовых", value: formatPercent(annualRate) },
    { label: "Срок", value: `${years} лет (${sim.months} мес.)` },
    { label: "Ежемесячный платёж", value: formatRub(base.payment) },
    { label: "Выплатите всего", value: formatRub(base.totalPaid) },
    { label: "Переплата (проценты)", value: formatRub(base.interestPaid) },
  ];

  if (sim.early) {
    const saved = base.interestPaid - sim.early.interestPaid;
    const monthsSaved = base.monthCount - sim.early.monthCount;

    setText("mortgage-early-months", `${sim.early.monthCount} мес.`);
    setText("mortgage-early-saved", formatRub(saved));
    setText("mortgage-early-total", formatRub(sim.early.totalPaid));

    steps.push(
      { label: "Досрочное погашение", value: `${formatRub(extraPayment)} на ${extraMonth}-м месяце` },
      { label: "Новый срок", value: `${sim.early.monthCount} мес. (−${monthsSaved} мес.)` },
      { label: "Экономия на процентах", value: formatRub(saved) },
      { label: "Выплатите с досрочным", value: formatRub(sim.early.totalPaid) }
    );
  } else {
    setText("mortgage-early-months", "—");
    setText("mortgage-early-saved", "—");
    setText("mortgage-early-total", "—");
  }

  setHtml("mortgage-steps", renderStepsTable(steps));
}

function simulateCredit(options) {
  const amount = Math.max(0, options.amount || 0);
  const months = Math.max(1, Math.floor(options.months || 1));
  const monthlyRate = (options.annualRate || 0) / 12;
  const type = options.type === "diff" ? "diff" : "annuity";
  const earlyOn = options.earlyMode === "on";
  const extraPayment = Math.max(0, options.extraPayment || 0);
  const extraMonth = Math.max(0, Math.floor(options.extraMonth || 0));
  const reducePayment = options.earlyEffect === "payment";

  const schedule = [];
  let balance = amount;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let totalPayments = 0;

  let annuityPay = type === "annuity" ? annuityPayment(amount, monthlyRate, months) : 0;
  let diffPrincipal = type === "diff" ? amount / months : 0;

  const maxMonths = months;

  for (let month = 1; month <= maxMonths && balance > 0.005; month += 1) {
    const interest = balance * monthlyRate;
    let principalDue =
      type === "annuity" ? Math.max(0, annuityPay - interest) : diffPrincipal;

    if (principalDue > balance) principalDue = balance;

    let extra = 0;
    if (earlyOn && extraPayment > 0 && month === extraMonth) {
      extra = Math.min(extraPayment, Math.max(0, balance - principalDue));
    }

    let principal = principalDue + extra;
    if (principal > balance) principal = balance;

    const paymentTotal = interest + principal;
    balance = Math.max(0, balance - principal);
    if (balance < 0.005) balance = 0;

    schedule.push({
      month,
      payment: paymentTotal,
      interest,
      principal,
      balance,
    });

    totalInterest += interest;
    totalPrincipal += principal;
    totalPayments += paymentTotal;

    if (balance <= 0) break;

    if (earlyOn && extraPayment > 0 && month === extraMonth && reducePayment) {
      const left = months - month;
      if (left > 0) {
        if (type === "annuity") {
          annuityPay = annuityPayment(balance, monthlyRate, left);
        } else {
          diffPrincipal = balance / left;
        }
      }
    }
  }

  const firstPayment = schedule[0] ? schedule[0].payment : 0;
  const lastPayment = schedule.length ? schedule[schedule.length - 1].payment : 0;
  const displayPayment =
    type === "annuity" ? annuityPayment(amount, monthlyRate, months) : firstPayment;

  return {
    type,
    basePayment: displayPayment,
    firstPayment,
    lastPayment,
    monthCount: schedule.length,
    schedule,
    totalInterest,
    totalPrincipal,
    totalPayments,
    balance,
  };
}

function renderCreditSchedule(schedule) {
  if (!schedule.length) {
    return '<p class="note">Нет данных для графика.</p>';
  }

  const rows = schedule
    .map(
      (row) =>
        `<tr><td>${row.month}</td><td>${formatRubPrecise(row.payment)}</td><td>${formatRubPrecise(row.interest)}</td><td>${formatRubPrecise(row.principal)}</td><td>${formatRubPrecise(row.balance)}</td></tr>`
    )
    .join("");

  return `<div class="table-scroll"><table class="calc-steps"><thead><tr><th>Месяц</th><th>Платёж</th><th>Проценты</th><th>Долг</th><th>Остаток</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function calcCredit(form) {
  const amount = parseNumber(form.amount.value);
  const months = Math.max(1, Math.floor(parseNumber(form.months.value) || 1));
  const annualRate = parseNumber(form.rate.value) / 100;
  const type = form.paymentType.value === "diff" ? "diff" : "annuity";
  const earlyMode = form.earlyMode.value === "on" ? "on" : "off";
  const extraPayment = parseNumber(form.extra.value);
  const extraMonth = Math.floor(parseNumber(form.extraMonth.value) || 0);
  const earlyEffect = form.earlyEffect.value === "payment" ? "payment" : "term";
  const fee = Math.max(0, parseNumber(form.fee.value));
  const insurance = Math.max(0, parseNumber(form.insurance.value));

  const sim = simulateCredit({
    amount,
    months,
    annualRate,
    type,
    earlyMode,
    extraPayment,
    extraMonth,
    earlyEffect,
  });

  const extrasTotal = fee + insurance;
  const grandTotal = sim.totalPayments + extrasTotal;
  const paymentLabel =
    type === "annuity"
      ? formatRub(sim.basePayment)
      : `${formatRub(sim.firstPayment)} → ${formatRub(sim.lastPayment)}`;

  setText("credit-payment", paymentLabel);
  setText("credit-overpay", formatRub(sim.totalInterest));
  setText("credit-total", formatRub(grandTotal));
  setText("credit-months", `${sim.monthCount} мес.`);
  setText("credit-fee-total", extrasTotal > 0 ? formatRub(extrasTotal) : "—");

  const steps = [
    { label: "Сумма кредита", value: formatRub(amount) },
    { label: "Ставка годовых (ваш ввод)", value: formatPercent(annualRate) },
    { label: "Срок", value: `${months} мес.` },
    {
      label: "Схема",
      value: type === "annuity" ? "Аннуитет" : "Дифференцированный",
    },
    {
      label: type === "annuity" ? "Платёж в месяц" : "Платежи (первый → последний)",
      value: paymentLabel,
    },
    { label: "Переплата по процентам", value: formatRub(sim.totalInterest) },
    { label: "Выплаты банку по графику", value: formatRub(sim.totalPayments) },
  ];

  if (fee > 0) steps.push({ label: "Разовая комиссия (ваш ввод)", value: formatRub(fee) });
  if (insurance > 0) {
    steps.push({ label: "Страховка (ваш ввод)", value: formatRub(insurance) });
  }
  if (extrasTotal > 0) {
    steps.push({ label: "Всего с комиссией и страховкой", value: formatRub(grandTotal) });
  }

  if (earlyMode === "on" && extraPayment > 0) {
    steps.push({
      label: "Досрочное погашение",
      value: `${formatRub(extraPayment)} на ${extraMonth}-м мес. (${
        earlyEffect === "payment" ? "уменьшить платёж" : "уменьшить срок"
      })`,
    });
  }

  setHtml("credit-steps", renderStepsTable(steps));
  setHtml("credit-schedule", renderCreditSchedule(sim.schedule));
}

function calcDismissal(form) {
  const salary = parseNumber(form.salary.value);
  const workDays = parseNumber(form.workDays.value);
  const workedDays = parseNumber(form.workedDays.value);
  const monthsWorked = Math.max(1, Math.min(12, parseNumber(form.months.value) || 12));
  const income = parseNumber(form.income.value);
  const unusedDays = parseNumber(form.unusedDays.value) || 0;

  const daysGross = workDays > 0 ? (salary / workDays) * workedDays : 0;
  const avgDaily = income / monthsWorked / 29.3;
  const compGross = avgDaily * unusedDays;

  const dayRate = salaryFromGross(salary, 0, null);
  const daysNdfl = daysGross * dayRate.effectiveRate;
  const impliedMonthly = income / monthsWorked;
  const compRate = salaryFromGross(impliedMonthly, 0, null);
  const compNdfl = compGross * compRate.effectiveRate;
  const gross = daysGross + compGross;
  const ndfl = daysNdfl + compNdfl;

  setText("dismissal-days", formatRub(daysGross));
  setText("dismissal-comp", formatRub(compGross));
  setText("dismissal-gross", formatRub(gross));
  setText("dismissal-ndfl", formatRub(ndfl));
  setText("dismissal-net", formatRub(gross - ndfl));

  const steps = [
    { label: "Оклад за месяц", value: formatRub(salary) },
    { label: "Рабочих дней в месяце", value: String(workDays) },
    { label: "Отработано дней", value: String(workedDays) },
    {
      label: "Зарплата за отработанные дни до НДФЛ",
      value:
        workDays > 0
          ? `${formatRub(salary)} ÷ ${workDays} × ${workedDays} = ${formatRub(daysGross)}`
          : "укажите рабочие дни месяца",
    },
    { label: "Доход за расчётный период", value: formatRub(income) },
    { label: "Месяцев в расчёте", value: String(monthsWorked) },
    {
      label: "Средний дневной заработок",
      value: `${formatRub(income)} ÷ ${monthsWorked} ÷ 29,3 = ${formatRubPrecise(avgDaily)}`,
    },
    { label: "Неиспользованных дней отпуска", value: String(unusedDays) },
    {
      label: "Компенсация отпуска до НДФЛ",
      value: `${formatRubPrecise(avgDaily)} × ${unusedDays} = ${formatRub(compGross)}`,
    },
    {
      label: "НДФЛ с компенсации (ставка от среднего за месяц)",
      value: `${formatRub(compGross)} × ${formatPercent(compRate.effectiveRate)} = ${formatRub(compNdfl)}`,
    },
    {
      label: "НДФЛ с зарплаты за дни (ставка от оклада)",
      value: `${formatRub(daysGross)} × ${formatPercent(dayRate.effectiveRate)} = ${formatRub(daysNdfl)}`,
    },
    { label: "Итого до НДФЛ", value: formatRub(gross) },
    { label: "На руки", value: formatRub(gross - ndfl) },
  ];
  setHtml("dismissal-steps", renderStepsTable(steps));
}

const NPD_RATE_PERSONS = 0.04;
const NPD_RATE_ORGS = 0.06;

function calcSamozanyaty(form) {
  const fromPersons = parseNumber(form.fromPersons.value);
  const fromOrgs = parseNumber(form.fromOrgs.value);
  const taxPersons = fromPersons * NPD_RATE_PERSONS;
  const taxOrgs = fromOrgs * NPD_RATE_ORGS;
  const total = taxPersons + taxOrgs;

  setText("npd-total", formatRub(total));
  setText("npd-persons", formatRub(taxPersons));
  setText("npd-orgs", formatRub(taxOrgs));

  const steps = [
    { label: "Доход от физлиц", value: formatRub(fromPersons) },
    {
      label: "Налог с дохода от физлиц",
      value: `${formatRub(fromPersons)} × ${formatPercent(NPD_RATE_PERSONS)} = ${formatRub(taxPersons)}`,
    },
    { label: "Доход от юрлиц и ИП", value: formatRub(fromOrgs) },
    {
      label: "Налог с дохода от юрлиц и ИП",
      value: `${formatRub(fromOrgs)} × ${formatPercent(NPD_RATE_ORGS)} = ${formatRub(taxOrgs)}`,
    },
    { label: "Сумма налога", value: formatRub(total) },
  ];
  setHtml("npd-steps", renderStepsTable(steps));
}

document.addEventListener("DOMContentLoaded", () => {
  bindCalculator("salary-form", calcSalary);
  bindCalculator("vacation-form", calcVacation);
  bindCalculator("compound-form", calcCompound);
  bindCalculator("sick-form", calcSick);
  bindCalculator("mortgage-form", calcMortgage);
  bindCalculator("credit-form", calcCredit);
  bindCalculator("dismissal-form", calcDismissal);
  bindCalculator("npd-form", calcSamozanyaty);
});
