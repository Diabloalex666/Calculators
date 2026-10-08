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

function calcUsnIncome(income, ratePercent, contributions, capAtHalf) {
  const raw = income * (ratePercent / 100);
  let used = Math.min(Math.max(0, contributions), raw);
  if (capAtHalf) used = Math.min(used, raw * 0.5);
  return { raw, used, tax: raw - used };
}

function calcUsnDiff(income, expenses, ratePercent) {
  const base = Math.max(0, income - expenses);
  const ordinary = base * (ratePercent / 100);
  const minimum = income * 0.01;
  return {
    base,
    ordinary,
    minimum,
    tax: Math.max(ordinary, minimum),
    usedMinimum: minimum > ordinary,
  };
}

function calcNalogIp(form) {
  const mode = form.mode.value;
  const income = parseNumber(form.income.value);
  const expenses = parseNumber(form.expenses.value);
  const contributions = parseNumber(form.contributions.value);
  const hasEmployees = form.hasEmployees.value === "yes";
  const incomeMode = mode === "income";

  toggleFormFields(form, "rate-income", incomeMode);
  toggleFormFields(form, "rate-diff", !incomeMode);
  toggleFormFields(form, "employees", incomeMode);

  const rate = incomeMode ? parseNumber(form.rateIncome.value) : parseNumber(form.rateDiff.value);
  let tax = 0;
  const steps = [
    { label: "Доход", value: formatRub(income) },
    { label: "Расходы", value: incomeMode ? "в этом режиме в налог не входят" : formatRub(expenses) },
  ];

  if (incomeMode) {
    const part = calcUsnIncome(income, rate, contributions, hasEmployees);
    tax = part.tax;
    steps.push(
      { label: "Ставка в поле", value: `${String(rate).replace(".", ",")}%` },
      {
        label: "Налог до взносов",
        value: `${formatRub(income)} × ${String(rate).replace(".", ",")}% = ${formatRub(part.raw)}`,
      },
      { label: "Уже уплаченные взносы", value: formatRub(contributions) },
      {
        label: "Уменьшение налога",
        value: hasEmployees
          ? `не больше 50% налога: ${formatRub(part.used)}`
          : `без ограничения 50%: ${formatRub(part.used)}`,
      }
    );
  } else {
    const part = calcUsnDiff(income, expenses, rate);
    tax = part.tax;
    steps.push(
      { label: "База", value: formatRub(part.base) },
      { label: "Ставка в поле", value: `${String(rate).replace(".", ",")}%` },
      {
        label: "Налог в общем порядке",
        value: `${formatRub(part.base)} × ${String(rate).replace(".", ",")}% = ${formatRub(part.ordinary)}`,
      },
      { label: "Минимальный налог 1% дохода", value: formatRub(part.minimum) },
      {
        label: "К уплате",
        value: part.usedMinimum ? `минимальный налог ${formatRub(part.tax)}` : formatRub(part.tax),
      }
    );
  }

  steps.push({ label: "Налог к уплате", value: formatRub(tax) });
  setText("ip-tax", formatRub(tax));
  setHtml("ip-steps", renderStepsTable(steps));
}

function calcNalogOrg(form) {
  const mode = form.mode.value;
  const income = parseNumber(form.income.value);
  const expenses = parseNumber(form.expenses.value);
  const dividends = parseNumber(form.dividends.value);
  const dividendTax = dividends * 0.13;
  const incomeMode = mode === "income";
  const diffMode = mode === "diff";

  toggleFormFields(form, "rate-income", incomeMode);
  toggleFormFields(form, "rate-diff", diffMode);
  toggleFormFields(form, "expenses", !incomeMode);

  let regimeTax = 0;
  const steps = [
    { label: "Доход", value: formatRub(income) },
  ];

  if (incomeMode) {
    const rate = parseNumber(form.rateIncome.value);
    regimeTax = income * (rate / 100);
    steps.push(
      { label: "Ставка в поле", value: `${String(rate).replace(".", ",")}%` },
      {
        label: "УСН «доходы»",
        value: `${formatRub(income)} × ${String(rate).replace(".", ",")}% = ${formatRub(regimeTax)}`,
      }
    );
  } else if (diffMode) {
    const rate = parseNumber(form.rateDiff.value);
    const part = calcUsnDiff(income, expenses, rate);
    regimeTax = part.tax;
    steps.push(
      { label: "Расходы", value: formatRub(expenses) },
      { label: "База", value: formatRub(part.base) },
      { label: "Ставка в поле", value: `${String(rate).replace(".", ",")}%` },
      {
        label: "Налог в общем порядке",
        value: `${formatRub(part.base)} × ${String(rate).replace(".", ",")}% = ${formatRub(part.ordinary)}`,
      },
      { label: "Минимальный налог 1% дохода", value: formatRub(part.minimum) }
    );
  } else {
    const base = Math.max(0, income - expenses);
    regimeTax = base * 0.25;
    steps.push(
      { label: "Расходы", value: formatRub(expenses) },
      { label: "База", value: formatRub(base) },
      { label: "Ставка налога на прибыль", value: "25%" },
      {
        label: "Налог на прибыль",
        value: `${formatRub(base)} × 25% = ${formatRub(regimeTax)}`,
      }
    );
  }

  const tax = regimeTax + dividendTax;
  steps.push(
    { label: "Дивиденды", value: formatRub(dividends) },
    { label: "Налог с дивидендов 13%", value: formatRub(dividendTax) },
    { label: "Налог к уплате", value: formatRub(tax) }
  );
  setText("org-tax", formatRub(tax));
  setHtml("org-steps", renderStepsTable(steps));
}

const PROD_2026 = {
  year: 2026,
  hoursPerDay: 8,
  shortHours: 7,
  workDays: { 1: 15, 2: 19, 3: 21, 4: 22, 5: 19, 6: 21, 7: 23, 8: 21, 9: 22, 10: 22, 11: 20, 12: 22 },
  hours40: { 1: 120, 2: 152, 3: 168, 4: 175, 5: 151, 6: 167, 7: 184, 8: 168, 9: 176, 10: 176, 11: 159, 12: 176 },
  off: {
    1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 17, 18, 24, 25, 31],
    2: [1, 7, 8, 14, 15, 21, 22, 23, 28],
    3: [1, 7, 8, 9, 14, 15, 21, 22, 28, 29],
    4: [4, 5, 11, 12, 18, 19, 25, 26],
    5: [1, 2, 3, 9, 10, 11, 16, 17, 23, 24, 30, 31],
    6: [6, 7, 12, 13, 14, 20, 21, 27, 28],
    7: [4, 5, 11, 12, 18, 19, 25, 26],
    8: [1, 2, 8, 9, 15, 16, 22, 23, 29, 30],
    9: [5, 6, 12, 13, 19, 20, 26, 27],
    10: [3, 4, 10, 11, 17, 18, 24, 25, 31],
    11: [1, 4, 7, 8, 14, 15, 21, 22, 28, 29],
    12: [5, 6, 12, 13, 19, 20, 26, 27, 31],
  },
  short: { 4: [30], 5: [8], 6: [11], 11: [3] },
};

const PROD_MONTHS = [
  "",
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const periodMarks = {};
let periodAnchor = null;
let periodCalSig = "";
let periodCalBound = false;
let periodViewMonth = null;
let periodYearOpen = false;
let periodSeenMonth = null;
let periodDrag = null;
let periodIgnoreClick = false;
let periodReleaseHandled = false;
let periodAwaitingEnd = false;
let periodPaySource = "parts";
let periodGrossTouched = false;
let periodPayLock = false;
let periodPayDaySeen = "";

function prodOff(month, day) {
  return PROD_2026.off[month].indexOf(day) !== -1;
}

function prodShort(month, day) {
  const list = PROD_2026.short[month];
  return Boolean(list && list.indexOf(day) !== -1);
}

function parseIsoDate(value) {
  const text = String(value || "").trim();
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  let y;
  let m;
  let d;
  if (dotted) {
    d = Number(dotted[1]);
    m = Number(dotted[2]);
    y = Number(dotted[3]);
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

function formatDotDate(y, m, d) {
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

function isLeapYear(year) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function browserToday() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

function maxDayForParts(monthText, yearText) {
  if (monthText.length !== 2) return 31;
  const month = Number(monthText);
  if (month < 1 || month > 12) return 31;
  if (month === 2 && yearText.length !== 4) return 29;
  const year = yearText.length === 4 ? Number(yearText) : 2001;
  return daysInMonth(year, month);
}

function clampDayPart(dayText, monthText, yearText) {
  if (!dayText || dayText.length < 2) return dayText;
  const day = Number(dayText);
  if (day < 1) return "";
  const max = maxDayForParts(monthText, yearText);
  return String(Math.min(day, max)).padStart(2, "0");
}

function splitDotParts(value) {
  const bits = String(value || "").split(".");
  return {
    d: (bits[0] || "").replace(/\D/g, "").slice(0, 2),
    m: (bits[1] || "").replace(/\D/g, "").slice(0, 2),
    y: (bits[2] || "").replace(/\D/g, "").slice(0, 4),
  };
}

function renderDotParts(parts) {
  return `${parts.d}.${parts.m}.${parts.y}`;
}

function partAt(pos, dayText, monthText) {
  const monthStart = dayText.length + 1;
  const yearStart = dayText.length + 1 + monthText.length + 1;
  if (pos < monthStart) return "d";
  if (pos < yearStart) return "m";
  return "y";
}

function applyMonthDigit(soFar, digit) {
  if (!soFar) {
    if (digit >= "2" && digit <= "9") return { value: `0${digit}`, done: true };
    if (digit === "0" || digit === "1") return { value: digit, done: false };
    return null;
  }
  const month = Number(soFar + digit);
  if (month < 1 || month > 12) return null;
  return { value: String(month).padStart(2, "0"), done: true };
}

function applyDayDigit(soFar, digit, maxDay) {
  if (!soFar) {
    const n = Number(digit);
    if (n >= 4 && n <= 9) {
      if (n > maxDay) return null;
      return { value: `0${digit}`, done: true };
    }
    if (n === 0) return { value: "0", done: false };
    if (n >= 1 && n <= 3) {
      if (n * 10 > maxDay) return null;
      return { value: digit, done: false };
    }
    return null;
  }
  const day = Number(soFar + digit);
  if (day < 1 || day > maxDay) return null;
  return { value: String(day).padStart(2, "0"), done: true };
}

function applyYearDigit(soFar, digit) {
  const start = soFar.length >= 4 ? "" : soFar;
  const value = start + digit;
  return { value, done: value.length === 4 };
}

function finalizeDotParts(parts) {
  let month = parts.m;
  let day = parts.d;
  const year = parts.y;
  if (month.length === 1) {
    const n = Number(month);
    month = n >= 1 && n <= 9 ? `0${month}` : "";
  } else if (month.length === 2 && (Number(month) < 1 || Number(month) > 12)) {
    month = "";
  }
  if (day.length === 1) {
    const n = Number(day);
    const max = maxDayForParts(month, year);
    day = n >= 1 && n <= max ? `0${day}` : "";
  }
  day = clampDayPart(day, month, year);
  return { d: day, m: month, y: year };
}

function caretAfterDotPart(parts, part, done) {
  if (part === "d") return done ? parts.d.length + 1 : parts.d.length;
  if (part === "m") {
    const start = parts.d.length + 1;
    return done ? start + parts.m.length + 1 : start + parts.m.length;
  }
  const start = parts.d.length + 1 + parts.m.length + 1;
  return done ? renderDotParts(parts).length : start + parts.y.length;
}

function writeDotInput(input, parts, part, done) {
  input.value = renderDotParts(parts);
  const pos = caretAfterDotPart(parts, part, done);
  try {
    input.setSelectionRange(pos, pos);
  } catch (error) {
    /* поле без каретки */
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function typeDotDigit(input, digit) {
  const parts = splitDotParts(input.value);
  const pos = input.selectionStart == null ? 0 : input.selectionStart;
  const part = partAt(pos, parts.d, parts.m);
  const current = parts[part];
  const fresh = current.length >= (part === "y" ? 4 : 2);
  let applied = null;
  if (part === "m") applied = applyMonthDigit(fresh ? "" : current, digit);
  else if (part === "d") applied = applyDayDigit(fresh ? "" : current, digit, maxDayForParts(parts.m, parts.y));
  else applied = applyYearDigit(fresh ? "" : current, digit);
  if (!applied) return;
  parts[part] = applied.value;
  if (part !== "d") parts.d = clampDayPart(parts.d, parts.m, parts.y);
  writeDotInput(input, parts, part, applied.done);
}

function backspaceDotPart(input) {
  const parts = splitDotParts(input.value);
  const pos = input.selectionStart == null ? 0 : input.selectionStart;
  const part = partAt(pos, parts.d, parts.m);
  parts[part] = parts[part].slice(0, -1);
  if (part !== "d") parts.d = clampDayPart(parts.d, parts.m, parts.y);
  writeDotInput(input, parts, part, false);
}

function bindDotDateField(input) {
  if (!input || input.dataset.dotDate === "1") return;
  input.dataset.dotDate = "1";
  input.addEventListener(
    "beforeinput",
    (event) => {
      if (event.inputType === "insertText") {
        event.preventDefault();
        if (event.data && /^\d$/.test(event.data)) typeDotDigit(input, event.data);
        return;
      }
      if (event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward") {
        event.preventDefault();
        backspaceDotPart(input);
      }
    },
    true
  );
  input.addEventListener("paste", (event) => {
    const text = event.clipboardData ? event.clipboardData.getData("text") : "";
    const match = String(text || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!match) return;
    event.preventDefault();
    const month = Number(match[2]);
    if (month < 1 || month > 12) return;
    const parts = finalizeDotParts({
      d: match[1].padStart(2, "0"),
      m: String(month).padStart(2, "0"),
      y: match[3],
    });
    writeDotInput(input, parts, "y", true);
  });
  input.addEventListener("blur", () => {
    const parts = finalizeDotParts(splitDotParts(input.value));
    const next = renderDotParts(parts);
    if (next === input.value) return;
    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function isoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function dateOrder(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function inDateRange(y, m, d, from, to) {
  if (!from || !to) return false;
  const cur = { y, m, d };
  return dateOrder(from, cur) <= 0 && dateOrder(cur, to) <= 0;
}

function calcPeriodPay(input) {
  const amount = Math.max(0, Number(input.amount) || 0);
  const amountMode = input.amountMode === "net" ? "net" : "gross";
  const countMode = input.countMode === "hours" ? "hours" : "days";
  const overtimeHours = Math.max(0, Number(input.overtimeHours) || 0);
  const overtimeMode = input.overtimeMode === "tk" ? "tk" : "flat";
  const from = parseIsoDate(input.from);
  const to = parseIsoDate(input.to);
  const marks = input.marks || {};
  const steps = [];
  const grossMonthly = amountMode === "net" ? grossFromNet(amount, 0, null) : amount;

  if (countMode === "hours") {
    const month = Math.min(12, Math.max(1, Math.round(Number(input.normMonth) || 1)));
    const normHours = PROD_2026.hours40[month];
    const workedHours = Math.max(0, Number(input.workedHours) || 0);
    const beforeTax = normHours > 0 ? (grossMonthly / normHours) * workedHours : 0;
    const rated = salaryFromGross(grossMonthly, 0, null);
    const ndfl = beforeTax * rated.effectiveRate;
    steps.push({
      label: amountMode === "net" ? "Введено на руки в месяц" : "Оклад в договоре до налога",
      value: formatRub(amount),
    });
    if (amountMode === "net") {
      steps.push({
        label: "Оклад до налога",
        value: `${formatRub(grossMonthly)} — тем же пересчётом, что в калькуляторе зарплаты`,
      });
    }
    steps.push({
      label: `${PROD_MONTHS[month]}, норма часов`,
      value: `${normHours} ч при 40-часовой неделе`,
    });
    steps.push({
      label: "До НДФЛ",
      value: `${formatRub(grossMonthly)} ÷ ${normHours} ч × ${String(workedHours).replace(".", ",")} ч = ${formatRub(beforeTax)}`,
    });
    steps.push({
      label: "НДФЛ",
      value: `${formatRub(beforeTax)} × ${formatPercent(rated.effectiveRate)} = ${formatRub(ndfl)}`,
    });
    steps.push({ label: "На руки", value: formatRub(beforeTax - ndfl) });
    return {
      ok: true,
      beforeTax,
      ndfl,
      net: beforeTax - ndfl,
      grossMonthly,
      overtimePay: 0,
      rate: rated.effectiveRate,
      steps,
    };
  }

  if (!from || !to || from.y !== PROD_2026.year || to.y !== PROD_2026.year || dateOrder(from, to) > 0) {
    return {
      ok: false,
      beforeTax: 0,
      ndfl: 0,
      net: 0,
      grossMonthly: 0,
      overtimePay: 0,
      steps: [{ label: "Период", value: "выберите даты внутри 2026 года" }],
    };
  }

  steps.push({
    label: amountMode === "net" ? "Введено на руки в месяц" : "Оклад в договоре до налога",
    value: formatRub(amount),
  });
  if (amountMode === "net") {
    steps.push({
      label: "Оклад до налога",
      value: `${formatRub(grossMonthly)} — тем же пересчётом, что в калькуляторе зарплаты`,
    });
  }

  const monthStats = {};
  let cursor = Date.UTC(from.y, from.m - 1, from.d);
  const end = Date.UTC(to.y, to.m - 1, to.d);
  let sickDays = 0;

  while (cursor <= end) {
    const dt = new Date(cursor);
    const m = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    const key = isoDate(PROD_2026.year, m, d);
    const mark = marks[key];
    if (!monthStats[m]) {
      monthStats[m] = { workedDays: 0, workedHours: 0, sick: 0, offHours: 0 };
    }
    const off = prodOff(m, d);
    if (mark === "sick" && !off) {
      monthStats[m].sick += 1;
      sickDays += 1;
    } else if (mark === "work" && off) {
      monthStats[m].offHours += PROD_2026.hoursPerDay;
    } else if (!off) {
      monthStats[m].workedDays += 1;
      monthStats[m].workedHours += prodShort(m, d) ? PROD_2026.shortHours : PROD_2026.hoursPerDay;
    }
    cursor += 86400000;
  }

  const monthIds = Object.keys(monthStats)
    .map(Number)
    .sort((a, b) => a - b);
  let base = 0;
  const rows = [];

  monthIds.forEach((m) => {
    const stat = monthStats[m];
    const normDays = PROD_2026.workDays[m];
    const normHours = PROD_2026.hours40[m];
    const units = countMode === "hours" ? stat.workedHours : stat.workedDays;
    const norm = countMode === "hours" ? normHours : normDays;
    const part = norm > 0 ? (grossMonthly / norm) * units : 0;
    base += part;
    rows.push({ m, stat, normDays, normHours, units, part });
    const normLabel = countMode === "hours" ? `${normHours} ч` : `${normDays} дн.`;
    const workedLabel = countMode === "hours" ? `${stat.workedHours} ч` : String(stat.workedDays);
    steps.push({
      label: `${PROD_MONTHS[m]}, норма месяца`,
      value: countMode === "hours" ? `${normHours} ч при 40-часовой неделе` : `${normDays} рабочих дней`,
    });
    steps.push({
      label: `${PROD_MONTHS[m]} до НДФЛ`,
      value:
        norm > 0
          ? `${formatRub(grossMonthly)} ÷ ${normLabel} × ${workedLabel} = ${formatRub(part)}`
          : "нет нормы месяца",
    });
  });

  let premiumLeft = overtimeMode === "tk" ? 2 : 0;
  let overtimePay = 0;
  const coefText = overtimeMode === "tk" ? "первые 2 ч периода × 1,5, дальше × 2" : "× 1";

  rows.forEach((row) => {
    const hours = row.stat.offHours || 0;
    if (hours <= 0) return;
    const rate = row.normHours > 0 ? grossMonthly / row.normHours : 0;
    let pay = 0;
    if (overtimeMode === "tk") {
      const premium = Math.min(premiumLeft, hours);
      premiumLeft -= premium;
      const rest = Math.max(0, hours - premium);
      pay = rate * (premium * 1.5 + rest * 2);
    } else {
      pay = rate * hours;
    }
    overtimePay += pay;
    steps.push({
      label: `Выходные и праздники, ${PROD_MONTHS[row.m]}`,
      value: `${formatRubPrecise(rate)}/ч × ${String(hours).replace(".", ",")} ч, ${coefText} = ${formatRub(pay)}`,
    });
  });

  const totalUnits = rows.reduce((sum, row) => sum + row.units, 0);
  let hoursLeft = overtimeHours;

  rows.forEach((row, index) => {
    let hours = 0;
    if (overtimeHours > 0) {
      if (totalUnits <= 0) {
        hours = index === 0 ? overtimeHours : 0;
      } else if (index === rows.length - 1) {
        hours = hoursLeft;
      } else {
        hours = overtimeHours * (row.units / totalUnits);
        hoursLeft -= hours;
      }
    }
    const rate = row.normHours > 0 ? grossMonthly / row.normHours : 0;
    let pay = 0;
    if (overtimeMode === "tk") {
      const premium = Math.min(premiumLeft, hours);
      premiumLeft -= premium;
      const rest = Math.max(0, hours - premium);
      pay = rate * (premium * 1.5 + rest * 2);
    } else {
      pay = rate * hours;
    }
    overtimePay += pay;
    if (hours > 0) {
      steps.push({
        label: `Переработка, ${PROD_MONTHS[row.m]}`,
        value: `${formatRubPrecise(rate)}/ч × ${String(hours).replace(".", ",")} ч, ${coefText} = ${formatRub(pay)}`,
      });
    }
  });

  const offHoursTotal = rows.reduce((sum, row) => sum + (row.stat.offHours || 0), 0);
  if ((overtimeHours > 0 || offHoursTotal > 0) && overtimeMode === "tk") {
    steps.push({
      label: "Коэффициенты переработки",
      value: "ст. 152 ТК РФ: первые 2 часа не менее ×1,5, последующие не менее ×2. Со 121-го часа в году каждый час не менее ×2; годовой счётчик в поле не ведётся",
    });
  }

  if (sickDays > 0) {
    steps.push({
      label: "Дни болезни",
      value: `${sickDays} — в эту сумму не входят`,
    });
  }

  const beforeTax = base + overtimePay;
  const rated = salaryFromGross(grossMonthly, 0, null);
  const ndfl = beforeTax * rated.effectiveRate;
  const net = beforeTax - ndfl;
  steps.push({ label: "До НДФЛ", value: formatRub(beforeTax) });
  steps.push({
    label: "НДФЛ",
    value: `${formatRub(beforeTax)} × ${formatPercent(rated.effectiveRate)} = ${formatRub(ndfl)}`,
  });
  steps.push({ label: "На руки", value: formatRub(net) });

  return {
    ok: true,
    beforeTax,
    ndfl,
    net,
    grossMonthly,
    overtimePay,
    rate: rated.effectiveRate,
    steps,
  };
}

function periodSignature(form) {
  const keys = Object.keys(periodMarks).sort();
  const mode = form.markMode ? form.markMode.value : "";
  const advance = form.advanceDay ? form.advanceDay.value : "";
  const salary = form.salaryDay ? form.salaryDay.value : "";
  return `${form.from.value}|${form.to.value}|${advance}|${salary}|${mode}|${periodYearOpen ? "year" : "month"}|${periodViewMonth}|${keys.map((key) => `${key}:${periodMarks[key]}`).join(",")}`;
}

function payDayKey(value) {
  const parsed = parseIsoDate(value);
  if (!parsed || parsed.y !== PROD_2026.year) return "";
  return isoDate(parsed.y, parsed.m, parsed.d);
}

function markModeValue(form) {
  return form && form.markMode ? form.markMode.value : "work";
}

function followTypedPayDay(form) {
  if (!form) return;
  const nextA = form.advanceDay ? form.advanceDay.value : "";
  const nextS = form.salaryDay ? form.salaryDay.value : "";
  const sig = `${nextA}|${nextS}`;
  if (sig === periodPayDaySeen) return;
  const prev = periodPayDaySeen;
  periodPayDaySeen = sig;
  if (!prev) return;
  const [prevA, prevS] = prev.split("|");
  const changed = nextA !== prevA ? nextA : nextS;
  const parsed = parseIsoDate(changed);
  if (parsed && parsed.y === PROD_2026.year) {
    periodViewMonth = parsed.m;
    periodSeenMonth = parsed.m;
  }
}

function setPayDay(form, mode, date) {
  if (!form || !date || date.y !== PROD_2026.year) return;
  const text = formatDotDate(date.y, date.m, date.d);
  if (mode === "advance" && form.advanceDay) form.advanceDay.value = text;
  if (mode === "salary" && form.salaryDay) form.salaryDay.value = text;
  periodViewMonth = date.m;
  periodSeenMonth = date.m;
}

function applyOpeningPeriod(form) {
  if (!form || form.dataset.periodOpened === "1") return;
  form.dataset.periodOpened = "1";
  const today = browserToday();
  const last = daysInMonth(today.y, today.m);
  form.from.value = formatDotDate(today.y, today.m, 1);
  form.to.value = formatDotDate(today.y, today.m, last);
  if (today.y === PROD_2026.year) {
    periodViewMonth = today.m;
    periodSeenMonth = today.m;
  }
}

function ensurePeriodViewMonth(form) {
  const parsed = parseIsoDate(form.from.value);
  const fromMonth = parsed && parsed.y === PROD_2026.year ? parsed.m : null;
  const today = browserToday();
  const todayMonth = today.y === PROD_2026.year ? today.m : null;
  if (periodViewMonth == null) periodViewMonth = fromMonth || todayMonth || 1;
  if (fromMonth && fromMonth !== periodSeenMonth) {
    periodViewMonth = fromMonth;
    periodSeenMonth = fromMonth;
  }
}

function renderPeriodMonth(m, from, to, advanceKey, salaryKey) {
  const month = document.createElement("div");
  month.className = "period-month";
  const title = document.createElement("p");
  title.className = "block-label";
  title.textContent = `${PROD_MONTHS[m]} · ${PROD_2026.workDays[m]} дн. · ${PROD_2026.hours40[m]} ч`;
  month.appendChild(title);

    const dow = document.createElement("div");
    dow.className = "period-dow";
    ["пн", "вт", "ср", "чт", "пт", "сб", "вс"].forEach((name) => {
      const cell = document.createElement("span");
      cell.textContent = name;
      dow.appendChild(cell);
    });
    month.appendChild(dow);

    const grid = document.createElement("div");
    grid.className = "period-grid";
    const first = new Date(Date.UTC(PROD_2026.year, m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    for (let i = 0; i < lead; i += 1) {
      const blank = document.createElement("span");
      blank.className = "period-day is-blank";
      grid.appendChild(blank);
    }
    const dim = new Date(Date.UTC(PROD_2026.year, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d += 1) {
      const key = isoDate(PROD_2026.year, m, d);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "period-day";
      button.dataset.date = key;
      button.textContent = String(d);
      const off = prodOff(m, d);
      const short = prodShort(m, d);
      const inside = inDateRange(PROD_2026.year, m, d, from, to);
      if (off) button.classList.add("is-off");
      if (short) button.classList.add("is-short");
      if (inside && !off) button.classList.add("is-in");
      const mark = periodMarks[key];
      const worked = mark === "work" || (inside && !off && mark !== "sick");
      if (mark === "sick") button.classList.add("is-sick");
      else if (worked) button.classList.add("is-work");
      if (key === advanceKey) button.classList.add("is-advance");
      if (key === salaryKey) button.classList.add("is-salary");
      const state = mark === "sick" ? "болезнь" : worked ? "отработан" : "не отмечен";
      const payNote = [
        key === advanceKey ? "день аванса" : "",
        key === salaryKey ? "день зарплаты" : "",
      ].filter(Boolean).join(", ");
      button.setAttribute(
        "aria-label",
        `${d} ${PROD_MONTHS[m]}, ${off ? "выходной или праздник" : short ? "сокращённый" : "рабочий"}, ${state}${payNote ? `, ${payNote}` : ""}`
      );
      grid.appendChild(button);
    }
    month.appendChild(grid);
  return month;
}

function renderPeriodCalendar(form) {
  const host = document.getElementById("period-calendar");
  if (!host) return;
  ensurePeriodViewMonth(form);
  const from = parseIsoDate(form.from.value);
  const to = parseIsoDate(form.to.value);
  const advanceKey = payDayKey(form.advanceDay && form.advanceDay.value);
  const salaryKey = payDayKey(form.salaryDay && form.salaryDay.value);
  host.replaceChildren();

  const bar = document.createElement("div");
  bar.className = "period-cal-bar";

  if (!periodYearOpen) {
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "period-nav";
    prev.dataset.cal = "prev";
    prev.textContent = "←";
    prev.setAttribute("aria-label", "Предыдущий месяц");
    prev.disabled = periodViewMonth <= 1;
    bar.appendChild(prev);

    const caption = document.createElement("p");
    caption.className = "period-cal-caption";
    caption.textContent = `${PROD_MONTHS[periodViewMonth]} ${PROD_2026.year}`;
    bar.appendChild(caption);

    const next = document.createElement("button");
    next.type = "button";
    next.className = "period-nav";
    next.dataset.cal = "next";
    next.textContent = "→";
    next.setAttribute("aria-label", "Следующий месяц");
    next.disabled = periodViewMonth >= 12;
    bar.appendChild(next);
  }

  const yearBtn = document.createElement("button");
  yearBtn.type = "button";
  yearBtn.className = "period-year-btn";
  yearBtn.dataset.cal = "year";
  yearBtn.textContent = periodYearOpen ? "Свернуть год" : "Весь год";
  yearBtn.setAttribute("aria-expanded", periodYearOpen ? "true" : "false");
  bar.appendChild(yearBtn);
  host.appendChild(bar);

  const board = document.createElement("div");
  board.className = periodYearOpen ? "period-year" : "period-month-view";
  const months = periodYearOpen
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    : [periodViewMonth];
  months.forEach((m) => board.appendChild(renderPeriodMonth(m, from, to, advanceKey, salaryKey)));
  host.appendChild(board);
}

function paintPeriodMark(form, key, mode) {
  if (!key || periodMarks[key] === mode) return false;
  periodMarks[key] = mode;
  expandPeriodToDate(form, parseIsoDate(key));
  return true;
}

function setPeriodDragRange(form, start, end) {
  if (!start || !end) return;
  const from = dateOrder(start, end) <= 0 ? start : end;
  const to = dateOrder(start, end) <= 0 ? end : start;
  form.from.value = formatDotDate(from.y, from.m, from.d);
  form.to.value = formatDotDate(to.y, to.m, to.d);
  periodAnchor = null;
  periodAwaitingEnd = false;
}

function markPeriodSpan(start, end, mode) {
  if (!start || !end || (mode !== "work" && mode !== "sick")) return;
  const from = dateOrder(start, end) <= 0 ? start : end;
  const to = dateOrder(start, end) <= 0 ? end : start;
  let cursor = Date.UTC(from.y, from.m - 1, from.d);
  const last = Date.UTC(to.y, to.m - 1, to.d);
  while (cursor <= last) {
    const dt = new Date(cursor);
    periodMarks[isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())] = mode;
    cursor += 86400000;
  }
}

function togglePeriodMark(key, mode) {
  if (!key || (mode !== "work" && mode !== "sick")) return;
  if (periodMarks[key] === mode) delete periodMarks[key];
  else periodMarks[key] = mode;
}

function dayHasExplicitMark(form, key) {
  if (periodMarks[key] === "work" || periodMarks[key] === "sick") return true;
  const advance = payDayKey(form && form.advanceDay ? form.advanceDay.value : "");
  const salary = payDayKey(form && form.salaryDay ? form.salaryDay.value : "");
  return key === advance || key === salary;
}

function clearDayMarks(form, key) {
  if (periodMarks[key]) delete periodMarks[key];
  if (form.advanceDay && payDayKey(form.advanceDay.value) === key) form.advanceDay.value = "";
  if (form.salaryDay && payDayKey(form.salaryDay.value) === key) form.salaryDay.value = "";
}

function applyPeriodDayClick(form, date, key, shift) {
  if (!form || !date || !key) return;
  if (shift) {
    const mode = markModeValue(form);
    if (mode === "advance" || mode === "salary") setPayDay(form, mode, date);
    else togglePeriodMark(key, mode === "sick" ? "sick" : "work");
  } else if (dayHasExplicitMark(form, key)) {
    clearDayMarks(form, key);
  } else if (periodAwaitingEnd && periodAnchor && dateOrder(periodAnchor, date) !== 0) {
    setPeriodDragRange(form, periodAnchor, date);
  } else {
    form.from.value = formatDotDate(date.y, date.m, date.d);
    form.to.value = formatDotDate(date.y, date.m, date.d);
    periodAnchor = date;
    periodAwaitingEnd = true;
  }
  periodCalSig = "";
  calcPeriodSalary(form);
}

function periodDayAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const button = el && el.closest ? el.closest("button[data-date]") : null;
  const host = document.getElementById("period-calendar");
  if (!button || button.disabled || !host || !host.contains(button)) return null;
  return button;
}

function onPeriodPointerDown(event) {
  if (event.button !== 0) return;
  if (event.target.closest("button[data-cal]")) return;
  const button = event.target.closest("button[data-date]");
  if (!button || button.disabled) return;
  const form = document.getElementById("period-form");
  const host = document.getElementById("period-calendar");
  if (!form || !host) return;
  periodIgnoreClick = false;
  periodReleaseHandled = false;
  periodDrag = {
    pointerId: event.pointerId,
    marking: event.shiftKey,
    mode: markModeValue(form),
    startKey: button.dataset.date,
    startDate: parseIsoDate(button.dataset.date),
    lastKey: button.dataset.date,
    moved: false,
  };
  try {
    if (host.setPointerCapture) host.setPointerCapture(event.pointerId);
  } catch (err) {
    /* жест всё равно завершится по pointerup */
  }
}

function onPeriodPointerMove(event) {
  if (!periodDrag || event.pointerId !== periodDrag.pointerId) return;
  if (event.buttons === 0) {
    onPeriodPointerUp(event);
    return;
  }
  const button = periodDayAt(event.clientX, event.clientY);
  if (!button || button.dataset.date === periodDrag.lastKey) return;
  const form = document.getElementById("period-form");
  if (!form) return;
  const key = button.dataset.date;
  periodDrag.moved = true;
  if (periodDrag.marking) {
    if (periodDrag.mode === "advance" || periodDrag.mode === "salary") {
      setPayDay(form, periodDrag.mode, parseIsoDate(key));
    } else {
      markPeriodSpan(periodDrag.startDate, parseIsoDate(key), periodDrag.mode);
    }
  } else {
    setPeriodDragRange(form, periodDrag.startDate, parseIsoDate(key));
  }
  periodDrag.lastKey = key;
  periodCalSig = "";
  calcPeriodSalary(form);
}

function onPeriodPointerUp(event) {
  if (!periodDrag) return;
  if (event && event.pointerId !== undefined && event.pointerId !== periodDrag.pointerId) return;
  const drag = periodDrag;
  const host = document.getElementById("period-calendar");
  try {
    if (host && event && event.pointerId !== undefined && host.hasPointerCapture && host.hasPointerCapture(event.pointerId)) {
      host.releasePointerCapture(event.pointerId);
    }
  } catch (err) {
    /* кнопка уже отпущена */
  }
  periodDrag = null;
  const form = document.getElementById("period-form");
  if (drag.moved) {
    periodIgnoreClick = true;
    return;
  }
  if (!form || !drag.startDate) return;
  const under = event ? periodDayAt(event.clientX, event.clientY) : null;
  const key = under && under.dataset.date ? under.dataset.date : drag.startKey;
  if (key !== drag.startKey) return;
  periodReleaseHandled = true;
  applyPeriodDayClick(form, drag.startDate, key, Boolean(event && event.shiftKey));
}

function onPeriodCalendarClick(event) {
  if (periodReleaseHandled) {
    periodReleaseHandled = false;
    return;
  }
  if (periodIgnoreClick) {
    periodIgnoreClick = false;
    return;
  }
  const form = document.getElementById("period-form");
  if (!form) return;
  const nav = event.target.closest("button[data-cal]");
  if (nav && !nav.disabled) {
    if (nav.dataset.cal === "prev") periodViewMonth = Math.max(1, periodViewMonth - 1);
    if (nav.dataset.cal === "next") periodViewMonth = Math.min(12, periodViewMonth + 1);
    if (nav.dataset.cal === "year") periodYearOpen = !periodYearOpen;
    periodCalSig = "";
    calcPeriodSalary(form);
    return;
  }
  const button = event.target.closest("button[data-date]");
  if (!button || button.disabled) return;
  const date = parseIsoDate(button.dataset.date);
  if (!date) return;
  applyPeriodDayClick(form, date, button.dataset.date, event.shiftKey);
}

function expandPeriodToDate(form, date) {
  if (!date || date.y !== PROD_2026.year) return;
  const from = parseIsoDate(form.from.value);
  const to = parseIsoDate(form.to.value);
  let start = from && from.y === PROD_2026.year ? from : date;
  let end = to && to.y === PROD_2026.year ? to : date;
  if (dateOrder(date, start) < 0) start = date;
  if (dateOrder(date, end) > 0) end = date;
  if (dateOrder(start, end) > 0) end = start;
  form.from.value = formatDotDate(start.y, start.m, start.d);
  form.to.value = formatDotDate(end.y, end.m, end.d);
}

function updatePeriodMarkCount(form) {
  const el = document.getElementById("period-mark-count");
  if (!el) return;
  const worked = new Set();
  const sick = new Set();
  const from = form ? parseIsoDate(form.from.value) : null;
  const to = form ? parseIsoDate(form.to.value) : null;
  if (from && to && from.y === PROD_2026.year && to.y === PROD_2026.year && dateOrder(from, to) <= 0) {
    let cursor = Date.UTC(from.y, from.m - 1, from.d);
    const end = Date.UTC(to.y, to.m - 1, to.d);
    while (cursor <= end) {
      const dt = new Date(cursor);
      const m = dt.getUTCMonth() + 1;
      const d = dt.getUTCDate();
      const key = isoDate(PROD_2026.year, m, d);
      if (!prodOff(m, d) && periodMarks[key] !== "sick") worked.add(key);
      cursor += 86400000;
    }
  }
  Object.keys(periodMarks).forEach((key) => {
    if (periodMarks[key] === "work") worked.add(key);
    else if (periodMarks[key] === "sick") sick.add(key);
  });
  el.textContent = `Отработано: ${worked.size} дн. · Больничных: ${sick.size} дн.`;
}

function fillNormMonthSelect(select) {
  if (!select || select.dataset.ready === "1") return;
  for (let month = 1; month <= 12; month += 1) {
    const option = document.createElement("option");
    option.value = String(month);
    option.textContent = `${PROD_MONTHS[month]} — ${PROD_2026.hours40[month]} ч`;
    select.appendChild(option);
  }
  const today = browserToday();
  select.value = today.y === PROD_2026.year ? String(today.m) : "1";
  select.dataset.ready = "1";
}

function formatPayInput(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function bindPeriodPayFold(form) {
  if (!form || form.dataset.payFold === "1") return;
  const button = document.getElementById("pay-fold");
  const panel = document.getElementById("pay-fold-panel");
  if (!button || !panel) return;
  form.dataset.payFold = "1";
  button.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

function syncPeriodPayFields(form) {
  if (!form || !form.gross || !form.net || periodPayLock) return;
  periodPayLock = true;
  if (periodPaySource === "net") {
    const net = Math.max(0, parseNumber(form.net.value));
    const needed = grossFromNet(net, 0, null);
    if (!periodGrossTouched) {
      form.gross.value = formatPayInput(needed);
      if (form.allowance) form.allowance.value = formatPayInput(0);
    } else if (form.allowance) {
      const gross = Math.max(0, parseNumber(form.gross.value));
      form.allowance.value = formatPayInput(Math.max(0, needed - gross));
    }
  } else {
    const gross = Math.max(0, parseNumber(form.gross.value));
    const allowance = form.allowance ? Math.max(0, parseNumber(form.allowance.value)) : 0;
    form.net.value = formatPayInput(salaryFromGross(gross + allowance, 0, null).net);
  }
  periodPayLock = false;
}

function periodAdvanceMonth(form) {
  const pay = parseIsoDate(form.advanceDay ? form.advanceDay.value : "");
  if (pay && pay.y === PROD_2026.year) return pay.m;
  const from = parseIsoDate(form.from ? form.from.value : "");
  if (from && from.y === PROD_2026.year) return from.m;
  return 0;
}

function periodAdvanceWorkedDays(month, fromValue, toValue) {
  if (!month || !PROD_2026.off[month]) return 0;
  const from = parseIsoDate(fromValue);
  const to = parseIsoDate(toValue);
  let worked = 0;
  for (let day = 1; day <= 15; day += 1) {
    if (prodOff(month, day)) continue;
    if (!inDateRange(PROD_2026.year, month, day, from, to)) continue;
    const key = isoDate(PROD_2026.year, month, day);
    if (periodMarks[key] === "sick") continue;
    worked += 1;
  }
  return worked;
}

function periodAdvanceHalf(form, gross) {
  const month = periodAdvanceMonth(form);
  const norm = month ? PROD_2026.workDays[month] : 0;
  const worked = periodAdvanceWorkedDays(month, form.from.value, form.to.value);
  const amount = norm > 0 ? (gross / norm) * worked : 0;
  return { month, norm, worked, amount };
}

function calcPeriodSalary(form) {
  applyOpeningPeriod(form);
  bindPeriodPayFold(form);
  syncPeriodPayFields(form);
  const byDays = form.countMode.value !== "hours";
  toggleFormFields(form, "by-days", byDays);
  toggleFormFields(form, "by-hours", !byDays);
  toggleFormFields(form, "advance-custom", form.advanceMode && form.advanceMode.value === "custom");
  fillNormMonthSelect(form.normMonth);
  bindDotDateField(form.from);
  bindDotDateField(form.to);
  bindDotDateField(form.advanceDay);
  bindDotDateField(form.salaryDay);
  const calendar = document.getElementById("period-calendar");
  if (calendar) calendar.hidden = !byDays;
  const calHint = document.getElementById("period-cal-hint");
  if (calHint) calHint.hidden = !byDays;
  const overtimeRow = document.getElementById("period-overtime-row");
  if (overtimeRow) overtimeRow.hidden = !byDays;

  const host = document.getElementById("period-calendar");
  if (host && !periodCalBound) {
    host.addEventListener("click", onPeriodCalendarClick);
    host.addEventListener("pointerdown", onPeriodPointerDown);
    host.addEventListener("pointermove", onPeriodPointerMove);
    host.addEventListener("pointerup", onPeriodPointerUp);
    host.addEventListener("pointercancel", onPeriodPointerUp);
    periodCalBound = true;
  }

  ensurePeriodViewMonth(form);
  followTypedPayDay(form);
  updatePeriodMarkCount(form);
  const sig = periodSignature(form);
  if (sig !== periodCalSig) {
    periodCalSig = sig;
    renderPeriodCalendar(form);
  }

  const gross = Math.max(0, parseNumber(form.gross.value));
  const allowance = form.allowance ? Math.max(0, parseNumber(form.allowance.value)) : 0;
  const amount = gross + allowance;
  const result = calcPeriodPay({
    amount,
    amountMode: "gross",
    countMode: form.countMode.value,
    from: form.from.value,
    to: form.to.value,
    marks: periodMarks,
    overtimeHours: byDays ? parseNumber(form.overtime.value) : 0,
    overtimeMode: form.overtimeMode.value,
    workedHours: form.workedHours ? parseNumber(form.workedHours.value) : 0,
    normMonth: form.normMonth && form.normMonth.value
      ? form.normMonth.value
      : (browserToday().y === PROD_2026.year ? String(browserToday().m) : "1"),
  });

  const grossOnly = Math.max(0, parseNumber(form.gross.value));
  const customAdvance = form.advanceMode && form.advanceMode.value === "custom";
  const half = periodAdvanceHalf(form, grossOnly);
  const advance = customAdvance
    ? Math.max(0, parseNumber(form.advanceAmount ? form.advanceAmount.value : 0))
    : half.amount;
  if (!customAdvance && half.month && half.norm > 0) {
    result.steps.push({
      label: "Аванс",
      value: `${formatRub(grossOnly)} ÷ ${half.norm} дн. × ${half.worked} с 1 по 15 = ${formatRub(advance)}`,
    });
  }
  setText("period-net", result.ok ? formatRub(result.net) : "—");
  setText("period-advance", formatRub(advance));
  setText("period-rest", result.ok ? formatRub(result.net - advance) : "—");
  setText("period-before", result.ok ? formatRub(result.beforeTax) : "—");
  setText("period-ndfl", result.ok ? formatRub(result.ndfl) : "—");
  setText("period-salary", result.ok ? formatRub(result.grossMonthly) : "—");
  setText("period-overtime", result.ok ? formatRub(result.overtimePay) : "—");
  setHtml("period-steps", renderStepsTable(result.steps));
}

document.addEventListener("DOMContentLoaded", () => {
  const periodForm = document.getElementById("period-form");
  if (periodForm) {
    periodForm.addEventListener(
      "input",
      (event) => {
        const id = event.target && event.target.id;
        if (id === "net") periodPaySource = "net";
        if (id === "gross") {
          periodGrossTouched = true;
          if (periodPaySource !== "net") periodPaySource = "parts";
        }
        if (id === "allowance") periodPaySource = "parts";
      },
      true
    );
  }
  bindCalculator("salary-form", calcSalary);
  bindCalculator("vacation-form", calcVacation);
  bindCalculator("compound-form", calcCompound);
  bindCalculator("sick-form", calcSick);
  bindCalculator("mortgage-form", calcMortgage);
  bindCalculator("credit-form", calcCredit);
  bindCalculator("dismissal-form", calcDismissal);
  bindCalculator("npd-form", calcSamozanyaty);
  bindCalculator("ip-form", calcNalogIp);
  bindCalculator("org-form", calcNalogOrg);
  bindCalculator("period-form", calcPeriodSalary);
});
