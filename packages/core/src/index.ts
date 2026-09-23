/** Financial dates are civil dates in Asia/Jakarta; amounts are integer rupiah. */
export type DateKey = string;
export type NeedKind = 'debt' | 'recurring' | 'goal';
export type FinancialStatus = 'safe' | 'warning' | 'shortfall';

export type PayrollCycle = 'daily' | 'monthly';

export interface Profile {
  name: string;
  dailyIncome: number;
  /** Expected everyday spending on every calendar day, including days off. */
  dailyBudget: number;
  /** JavaScript weekday numbers: Sunday = 0, Saturday = 6. */
  workDays: number[];
  openingBalance: number;
  startDate: DateKey;
  /** Daily cash allowance given on active work/study days (cash in hand), Rp 0 on off days. */
  activityAllowance?: number;
  /** Payroll disbursement cycle: 'daily' (default) or 'monthly' (accrued to payday). */
  payrollCycle?: PayrollCycle;
  /** Day of the month when monthly salary is disbursed (1-28, default: 5). */
  payday?: number;
  /** Optional base64 or remote URL for profile photo. */
  avatarUrl?: string;
}

export interface PayrollSummary {
  accruedCurrentMonth: number;
  projectedMonthEnd: number;
  actualWorkdays: number;
  totalMonthWorkdays: number;
  remainingWorkdays: number;
  monthStart: DateKey;
  monthEnd: DateKey;
  nextPayday: DateKey;
  daysUntilPayday: number;
  lockedPreviousMonthSalary: number;
  totalAllowanceMonth: number;
  allowanceReceived: number;
}

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: DateKey;
  needId?: string;
  /** Attendance-linked transactions are replaced, never appended twice. */
  attendanceDate?: DateKey;
  /** Additional/unexpected spending must not consume the routine daily estimate. */
  budgetTreatment?: 'daily' | 'additional';
}

export interface Need {
  id: string;
  title: string;
  amount: number;
  /** Virtual allocation, not an additional expense or a separate bank balance. */
  saved: number;
  dueDate: DateKey;
  kind: NeedKind;
  intervalDays?: number;
  priority: 'essential' | 'flexible';
  paid?: boolean;
  paidAmount?: number;
}

export interface Attendance {
  date: DateKey;
  status: 'present' | 'absent' | 'holiday' | 'half';
  income?: number;
  allowance?: number;
  /** Future attendance remains an estimate until the user confirms actual work. */
  planned?: boolean;
}

export interface AppState {
  profile: Profile;
  transactions: Transaction[];
  needs: Need[];
  attendance: Attendance[];
}

export interface ForecastOptions {
  asOf?: DateKey;
  horizonDays?: number;
  /** Simulation only; the input state and its ledger remain unchanged. */
  absentDates?: DateKey[];
}

export interface ForecastDay {
  date: DateKey;
  income: number;
  expenses: number;
  balance: number;
  workday: boolean;
  needs: Need[];
  status: FinancialStatus;
}

export interface ForecastRisk {
  needId: string;
  title: string;
  date: DateKey;
  shortfall: number;
  kind: NeedKind;
}

export interface ForecastResult {
  asOf: DateKey;
  days: ForecastDay[];
  risks: ForecastRisk[];
  shortfall: number;
  minBalance: number;
  safeToSpend: number;
  workdays: number;
  /** Minimum contribution per future workday to cover the forecast, rounded up. */
  requiredDaily: number;
  currentBalance: number;
  projectedBalance: number;
  expectedIncome: number;
  plannedExpenses: number;
  allocated: number;
  nextNeed: Need | null;
  status: FinancialStatus;
}

export const TIME_ZONE = 'Asia/Jakarta';

export function localDate(date = new Date()): DateKey {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertDate(value: unknown): asserts value is DateKey {
  if (!isDateKey(value)) throw new Error('Tanggal tidak valid. Gunakan YYYY-MM-DD.');
}

export function addDays(date: DateKey, days: number): DateKey {
  assertDate(date);
  if (!Number.isInteger(days)) throw new Error('Jumlah hari harus bilangan bulat.');
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysBetween(from: DateKey, to: DateKey): number {
  assertDate(from);
  assertDate(to);
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function currency(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(value);
}

export function formatThousands(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const clean = String(value).replace(/\D/g, '');
  if (!clean) return '';
  const num = Number(clean);
  if (!Number.isFinite(num)) return '';
  return new Intl.NumberFormat('id-ID').format(num);
}

export function parseThousands(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (!value) return 0;
  const clean = String(value).replace(/\D/g, '');
  return clean ? Math.min(1_000_000_000_000, Number(clean)) : 0;
}

export function remainingAmount(need: Need): number {
  return need.paid ? 0 : Math.max(0, need.amount - (need.paidAmount ?? 0));
}

function allocatedAmount(state: AppState): number {
  return state.needs.reduce((sum, need) => sum + Math.min(need.saved, remainingAmount(need)), 0);
}

function countsTowardDailyBudget(transaction: Transaction): boolean {
  if (transaction.type !== 'expense' || transaction.needId) return false;
  if (transaction.budgetTreatment) return transaction.budgetTreatment === 'daily';
  // Preserve compatibility with existing clients that use these expense categories.
  return !['mendadak', 'darurat'].includes(transaction.category.trim().toLocaleLowerCase('id-ID'));
}

/** Attendance only affects balance through its one linked ledger transaction. */
export function balance(state: AppState, asOf = localDate()): number {
  assertDate(asOf);
  return state.profile.openingBalance + state.transactions
    .filter((transaction) => transaction.date <= asOf)
    .reduce((sum, transaction) => sum + (transaction.type === 'income' ? transaction.amount : -transaction.amount), 0);
}

import { INDONESIAN_HOLIDAYS, getHoliday, isNationalHoliday } from './holidays';
export { INDONESIAN_HOLIDAYS, getHoliday, isNationalHoliday };

export function isWorkday(state: AppState, date: DateKey): boolean {
  assertDate(date);
  const entry = state.attendance.find((attendance) => attendance.date === date);
  if (entry) return entry.status === 'present' || entry.status === 'half';
  if (isNationalHoliday(date)) return false;
  return state.profile.workDays.includes(new Date(`${date}T12:00:00Z`).getUTCDay());
}

export function getMonthBounds(date: DateKey): { start: DateKey; end: DateKey } {
  assertDate(date);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonthFirst = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = addDays(nextMonthFirst, -1);
  return { start, end };
}

export function getPreviousMonthBounds(date: DateKey): { start: DateKey; end: DateKey } {
  assertDate(date);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const prevMonthFirst = month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, '0')}-01`;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const prevMonthEnd = addDays(monthStart, -1);
  return { start: prevMonthFirst, end: prevMonthEnd };
}

export function calculatePayroll(state: AppState, asOf = localDate()): PayrollSummary {
  assertDate(asOf);
  const { start: monthStart, end: monthEnd } = getMonthBounds(asOf);
  const { start: prevStart, end: prevEnd } = getPreviousMonthBounds(asOf);
  const paydayDay = Math.min(28, Math.max(1, state.profile.payday ?? 5));
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7));
  const currentPaydayStr = `${year}-${String(month).padStart(2, '0')}-${String(paydayDay).padStart(2, '0')}`;

  let nextPayday: DateKey;
  if (asOf < currentPaydayStr) {
    nextPayday = currentPaydayStr;
  } else {
    nextPayday = month === 12
      ? `${year + 1}-01-${String(paydayDay).padStart(2, '0')}`
      : `${year}-${String(month + 1).padStart(2, '0')}-${String(paydayDay).padStart(2, '0')}`;
  }
  const daysUntilPayday = Math.max(0, daysBetween(asOf, nextPayday));

  const computeRange = (start: DateKey, end: DateKey) => {
    let accrued = 0;
    let projected = 0;
    let actualDays = 0;
    let totalWorkdays = 0;
    let allowanceTotal = 0;
    let allowanceReceived = 0;

    let current = start;
    while (current <= end) {
      const isPastOrToday = current <= asOf;
      const att = state.attendance.find((a) => a.date === current);
      const scheduledWorkday = isWorkday(state, current);

      if (scheduledWorkday) totalWorkdays++;

      const dailyRate = state.profile.dailyIncome;
      const allowanceRate = state.profile.activityAllowance ?? 0;

      if (att) {
        if (att.status === 'present') {
          const inc = att.income ?? dailyRate;
          if (isPastOrToday && !att.planned) {
            accrued += inc;
            projected += inc;
            actualDays++;
            allowanceReceived += allowanceRate;
            allowanceTotal += allowanceRate;
          } else {
            projected += inc;
            allowanceTotal += allowanceRate;
          }
        } else if (att.status === 'half') {
          const inc = att.income ?? Math.floor(dailyRate * 0.5);
          const halfAllowance = att.allowance !== undefined ? att.allowance : Math.floor(allowanceRate * 0.5);
          if (isPastOrToday && !att.planned) {
            accrued += inc;
            projected += inc;
            actualDays += 0.5;
            allowanceReceived += halfAllowance;
            allowanceTotal += halfAllowance;
          } else {
            projected += inc;
            allowanceTotal += halfAllowance;
          }
        }
      } else if (scheduledWorkday) {
        if (isPastOrToday) {
          accrued += dailyRate;
          projected += dailyRate;
          actualDays++;
          allowanceReceived += allowanceRate;
          allowanceTotal += allowanceRate;
        } else {
          projected += dailyRate;
          allowanceTotal += allowanceRate;
        }
      }
      current = addDays(current, 1);
    }
    return { accrued, projected, actualDays, totalWorkdays, allowanceTotal, allowanceReceived };
  };

  const currentMonth = computeRange(monthStart, monthEnd);
  const prevMonth = computeRange(prevStart, prevEnd);

  return {
    accruedCurrentMonth: currentMonth.accrued,
    projectedMonthEnd: currentMonth.projected,
    actualWorkdays: currentMonth.actualDays,
    totalMonthWorkdays: currentMonth.totalWorkdays,
    remainingWorkdays: Math.max(0, currentMonth.totalWorkdays - currentMonth.actualDays),
    monthStart,
    monthEnd,
    nextPayday,
    daysUntilPayday,
    lockedPreviousMonthSalary: prevMonth.accrued || prevMonth.projected,
    totalAllowanceMonth: currentMonth.allowanceTotal,
    allowanceReceived: currentMonth.allowanceReceived,
  };
}

export function defaultState(today = localDate()): AppState {
  assertDate(today);
  return {
    profile: { name: '', dailyIncome: 0, dailyBudget: 0, workDays: [1, 2, 3, 4, 5, 6], openingBalance: 0, startDate: today },
    transactions: [], needs: [], attendance: [],
  };
}

/** Demo data is explicit and never silently mixed into a user's real records. */
export function demoState(today = localDate()): AppState {
  const state = defaultState(today);
  state.profile = { name: 'Rangga', dailyIncome: 120_000, dailyBudget: 30_000, workDays: [1, 2, 3, 4, 5, 6], openingBalance: 485_000, startDate: addDays(today, -7), activityAllowance: 50_000, payrollCycle: 'monthly', payday: 5 };
  state.transactions = [
    { id: 'demo-income', title: 'Pendapatan kerja', amount: 120_000, type: 'income', category: 'Kerja', date: addDays(today, -1) },
    { id: 'demo-food', title: 'Makan siang', amount: 25_000, type: 'expense', category: 'Makan', date: today },
    { id: 'demo-coffee', title: 'Kopi & camilan', amount: 15_000, type: 'expense', category: 'Jajan', date: addDays(today, -1) },
  ];
  state.needs = [
    { id: 'bensin', title: 'Bensin motor', amount: 100_000, saved: 70_000, dueDate: addDays(today, 3), kind: 'recurring', intervalDays: 7, priority: 'essential' },
    { id: 'utang', title: 'Cicilan motor', amount: 850_000, saved: 250_000, dueDate: addDays(today, 8), kind: 'debt', priority: 'essential' },
    { id: 'darurat', title: 'Dana darurat', amount: 300_000, saved: 40_000, dueDate: addDays(today, 28), kind: 'goal', priority: 'flexible' },
  ];
  return state;
}

function occurrences(state: AppState, asOf: DateKey, end: DateKey): Need[] {
  const result: Need[] = [];
  for (const need of state.needs) {
    if (remainingAmount(need) === 0) continue;
    if (need.dueDate <= end) result.push({ ...need, dueDate: need.dueDate < asOf ? asOf : need.dueDate });
    if (need.kind !== 'recurring' || !need.intervalDays) continue;
    // Overdue occurrence is payable today; future estimates restart from today.
    let date = addDays(need.dueDate < asOf ? asOf : need.dueDate, need.intervalDays);
    while (date <= end) {
      result.push({ ...need, dueDate: date, saved: 0, paidAmount: 0 });
      date = addDays(date, need.intervalDays);
    }
  }
  return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate) ||
    (a.priority === b.priority ? a.id.localeCompare(b.id) : a.priority === 'essential' ? -1 : 1));
}

export function forecast(state: AppState, options: ForecastOptions = {}): ForecastResult {
  validateState(state);
  const asOf = options.asOf ?? localDate();
  assertDate(asOf);
  const horizonDays = options.horizonDays ?? 30;
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 366) throw new Error('Rentang prediksi harus 1 sampai 366 hari.');
  const absentDates = new Set(options.absentDates ?? []);
  for (const date of absentDates) assertDate(date);
  const end = addDays(asOf, horizonDays - 1);
  const needs = occurrences(state, asOf, end);
  const currentBalance = balance(state, asOf);
  // Replacing a recorded workday in a simulation must also remove its actual income.
  const reversedIncome = state.transactions.filter((transaction) =>
    transaction.type === 'income' && transaction.attendanceDate && absentDates.has(transaction.attendanceDate) && transaction.date <= asOf,
  ).reduce((sum, transaction) => sum + transaction.amount, 0);
  let running = currentBalance - reversedIncome;
  let minBalance = running;
  let expectedIncome = 0;
  let plannedExpenses = 0;
  let workdays = 0;
  let requiredDaily = 0;
  let outsideIncome = 0;
  const days: ForecastDay[] = [];
  const risks: ForecastRisk[] = [];
  const allocated = allocatedAmount(state);

  for (let index = 0; index < horizonDays; index++) {
    const date = addDays(asOf, index);
    const attendance = state.attendance.find((entry) => entry.date === date);
    const missed = absentDates.has(date);
    const workday = !missed && isWorkday(state, date);
    const transactions = state.transactions.filter((transaction) => transaction.date === date);
    const workIncomeRecorded = transactions.some((transaction) => transaction.type === 'income' && transaction.attendanceDate === date);
    const actualIncome = index === 0 ? 0 : transactions.filter((transaction) =>
      transaction.type === 'income' && !(missed && transaction.attendanceDate === date),
    ).reduce((sum, transaction) => sum + transaction.amount, 0);
    const isMonthly = state.profile.payrollCycle === 'monthly';
    const dayNumber = Number(date.slice(8, 10));
    const paydayDay = Math.min(28, Math.max(1, state.profile.payday ?? 5));
    const isPayday = isMonthly && dayNumber === paydayDay;

    let monthlySalaryDisbursement = 0;
    if (isPayday) {
      // People may record the salary they actually received as a generic income
      // category. Recognize its title too, or the automatic payday estimate is
      // added on top of the same real-world paycheck.
      const alreadyHasSalary = transactions.some((t) =>
        t.type === 'income' && /gaji|payroll|salary/i.test(`${t.category} ${t.title}`),
      );
      if (!alreadyHasSalary) {
        const { start: pStart, end: pEnd } = getPreviousMonthBounds(date);
        let prevWorkdays = 0;
        let c = pStart;
        while (c <= pEnd) {
          const att = state.attendance.find((a) => a.date === c);
          if (att) {
            if (att.status === 'present') prevWorkdays += 1;
            else if (att.status === 'half') prevWorkdays += 0.5;
          } else if (isWorkday(state, c)) {
            prevWorkdays += 1;
          }
          c = addDays(c, 1);
        }
        monthlySalaryDisbursement = Math.floor(prevWorkdays * state.profile.dailyIncome);
      }
    }

    let potentialIncome = 0;
    if (isMonthly) {
      const allowance = state.profile.activityAllowance ?? 0;
      const dailyCash = attendance?.status === 'half'
        ? (attendance.allowance !== undefined ? attendance.allowance : Math.floor(allowance * 0.5))
        : allowance;
      const potentialAllowance = workday && !workIncomeRecorded && !(index === 0 && attendance && !attendance.planned)
        ? dailyCash : 0;
      potentialIncome = potentialAllowance + monthlySalaryDisbursement;
    } else {
      const totalDailyRate = state.profile.dailyIncome + (state.profile.activityAllowance ?? 0);
      const attendanceIncome = attendance?.status === 'present' || attendance?.status === 'half'
        ? attendance.income ?? Math.floor(totalDailyRate * (attendance.status === 'half' ? 0.5 : 1))
        : totalDailyRate;
      potentialIncome = workday && !workIncomeRecorded && !(index === 0 && attendance && !attendance.planned)
        ? attendanceIncome : 0;
    }
    const income = actualIncome + potentialIncome;
    const cashWorkday = workday && (!attendance || attendance.planned || index > 0) && !workIncomeRecorded;
    if (cashWorkday) workdays++;
    outsideIncome += actualIncome;
    const regularSpending = transactions.filter(countsTowardDailyBudget)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const actualExpenses = index === 0 ? 0 : transactions.filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    // Today's recorded lunch replaces that part of the budget; it is not charged twice.
    const dailyExpense = Math.max(0, state.profile.dailyBudget - regularSpending);
    let expenses = dailyExpense + actualExpenses;
    running += income - expenses;
    const due = needs.filter((need) => need.dueDate === date);
    for (const need of due) {
      const amount = remainingAmount(need);
      expenses += amount;
      running -= amount;
      if (running < 0) risks.push({ needId: need.id, title: need.title, date, shortfall: -running, kind: need.kind });
    }
    expectedIncome += income;
    plannedExpenses += expenses;
    const stillRequired = Math.max(0, plannedExpenses - (currentBalance - reversedIncome) - outsideIncome);
    if (workdays > 0) requiredDaily = Math.max(requiredDaily, Math.ceil(stillRequired / workdays));
    minBalance = Math.min(minBalance, running);
    const status: FinancialStatus = running < 0 ? 'shortfall' : running < state.profile.dailyBudget * 3 ? 'warning' : 'safe';
    days.push({ date, income, expenses, balance: running, workday, needs: due, status });
  }
  const shortfall = Math.max(0, -minBalance);
  const safeToSpend = Math.max(0, Math.min(currentBalance - reversedIncome - allocated, minBalance));
  return {
    asOf, days, risks, shortfall, minBalance, safeToSpend, workdays, requiredDaily,
    currentBalance: currentBalance - reversedIncome, projectedBalance: running,
    expectedIncome, plannedExpenses, allocated,
    nextNeed: needs[0] ?? null,
    status: shortfall > 0 ? 'shortfall' : safeToSpend < Math.max(state.profile.dailyBudget * 3, 1) ? 'warning' : 'safe',
  };
}

export type FinancialAction =
  | { type: 'transaction/add'; transaction: Transaction }
  | { type: 'attendance/record'; attendance: Attendance }
  | { type: 'need/add'; need: Need }
  | { type: 'need/update'; id: string; changes: Partial<Need> }
  | { type: 'need/reschedule'; id: string; dueDate: DateKey }
  | { type: 'need/pay'; id: string; date: DateKey; amount?: number }
  | { type: 'profile/update'; profile: Partial<Profile> }
  | { type: 'state/reset'; state: AppState };

export function reducer(state: AppState, action: FinancialAction): AppState {
  let next: AppState;
  let checkAllocations = false;
  switch (action.type) {
    case 'transaction/add': {
      // Retried offline operations must never create duplicate financial entries.
      if (state.transactions.some((transaction) => transaction.id === action.transaction.id)) return state;
      next = { ...state, transactions: [...state.transactions, action.transaction] };
      break;
    }
    case 'attendance/record': {
      const entry = { ...action.attendance, planned: action.attendance.date > localDate() };
      assertDate(entry.date);
      const transactions = state.transactions.filter((transaction) => transaction.attendanceDate !== entry.date && transaction.id !== `attendance:${entry.date}`);
      if (!entry.planned && (entry.status === 'present' || entry.status === 'half')) {
        const isMonthly = state.profile.payrollCycle === 'monthly';
        const workIncome = entry.income ?? Math.floor(state.profile.dailyIncome * (entry.status === 'half' ? 0.5 : 1));
        const allowance = entry.allowance !== undefined
          ? entry.allowance
          : (state.profile.activityAllowance ? Math.floor(state.profile.activityAllowance * (entry.status === 'half' ? 0.5 : 1)) : 0);
        if (isMonthly) {
          if (allowance > 0) {
            transactions.push({
              id: `attendance:${entry.date}`,
              title: entry.status === 'half' ? 'Tunjangan aktivitas (½ hari)' : 'Tunjangan aktivitas (uang saku)',
              amount: allowance,
              type: 'income',
              category: 'Tunjangan',
              date: entry.date,
              attendanceDate: entry.date,
            });
          }
        } else {
          const total = workIncome + allowance;
          if (total > 0) {
            transactions.push({
              id: `attendance:${entry.date}`,
              title: entry.status === 'half' ? 'Kerja setengah hari' : 'Pendapatan kerja',
              amount: total,
              type: 'income',
              category: 'Kerja',
              date: entry.date,
              attendanceDate: entry.date,
            });
          }
        }
      }
      next = { ...state, transactions, attendance: [...state.attendance.filter((attendance) => attendance.date !== entry.date), entry] };
      break;
    }
    case 'need/add':
      if (state.needs.some((need) => need.id === action.need.id)) return state;
      next = { ...state, needs: [...state.needs, action.need] };
      checkAllocations = action.need.saved > 0;
      break;
    case 'need/update': {
      const need = state.needs.find((entry) => entry.id === action.id);
      if (!need || need.paid) throw new Error('Kebutuhan aktif tidak ditemukan.');
      if (action.changes.id !== undefined && action.changes.id !== need.id) throw new Error('ID kebutuhan tidak dapat diubah.');
      if ((action.changes.paid !== undefined && action.changes.paid !== need.paid) ||
          (action.changes.paidAmount !== undefined && action.changes.paidAmount !== need.paidAmount)) {
        throw new Error('Gunakan pencatatan pembayaran untuk mengubah jumlah terbayar.');
      }
      const updated = { ...need, ...action.changes, id: need.id, paid: need.paid, paidAmount: need.paidAmount };
      next = { ...state, needs: state.needs.map((entry) => entry.id === action.id ? updated : entry) };
      // Reductions remain possible when an unexpected expense underfunds old allocations.
      checkAllocations = updated.saved > need.saved;
      break;
    }
    case 'need/reschedule': {
      assertDate(action.dueDate);
      if (!state.needs.some((need) => need.id === action.id && !need.paid)) throw new Error('Kebutuhan aktif tidak ditemukan.');
      next = { ...state, needs: state.needs.map((need) => need.id === action.id ? { ...need, dueDate: action.dueDate } : need) };
      break;
    }
    case 'need/pay': {
      assertDate(action.date);
      if (action.date > localDate()) throw new Error('Pembayaran aktual tidak boleh bertanggal mendatang. Ubah jadwal kebutuhan untuk merencanakannya.');
      const need = state.needs.find((entry) => entry.id === action.id);
      if (!need) throw new Error('Kebutuhan tidak ditemukan.');
      if (need.paid) return state;
      const amount = action.amount ?? remainingAmount(need);
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remainingAmount(need)) throw new Error('Nominal pembayaran melebihi sisa kebutuhan atau tidak valid.');
      const paidAmount = (need.paidAmount ?? 0) + amount;
      const paid = paidAmount === need.amount;
      const updated: Need = { ...need, paidAmount, paid, saved: Math.max(0, need.saved - amount) };
      const needs = state.needs.map((entry) => entry.id === need.id ? updated : entry);
      if (paid && need.kind === 'recurring' && need.intervalDays) {
        const dueDate = addDays(action.date, need.intervalDays);
        const baseId = `${need.id.split(':next:')[0]}:next:${dueDate}`;
        const existingIds = new Set(needs.map((entry) => entry.id));
        let nextId = baseId;
        let sequence = 1;
        while (existingIds.has(nextId)) nextId = `${baseId}:${++sequence}`;
        needs.push({ ...need, id: nextId, dueDate, saved: 0, paid: false, paidAmount: 0 });
      }
      next = { ...state, needs, transactions: [...state.transactions, {
        id: `payment:${need.id}:${paidAmount}`, title: need.title, amount, type: 'expense',
        category: need.kind === 'debt' ? 'Utang' : need.kind === 'goal' ? 'Tujuan' : 'Kebutuhan', date: action.date, needId: need.id,
      }] };
      break;
    }
    case 'profile/update':
      next = { ...state, profile: { ...state.profile, ...action.profile } };
      break;
    case 'state/reset':
      next = action.state;
      break;
    default:
      return state;
  }
  const validated = validateState(next);
  if (checkAllocations && allocatedAmount(validated) > Math.max(0, balance(validated))) {
    throw new Error('Alokasi dana melebihi saldo tersedia. Kurangi alokasi atau catat pemasukan terlebih dahulu.');
  }
  return validated;
}

/** Reject malformed imports/sync payloads before they can alter the ledger. */
export function validateState(value: unknown): AppState {
  const fail = (message: string): never => { throw new Error(`Data keuangan tidak valid: ${message}`); };
  const record = (item: unknown): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item);
  const money = (item: unknown) => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0 && item <= 1_000_000_000_000;
  const text = (item: unknown) => typeof item === 'string' && item.trim().length > 0 && item.length <= 200;
  if (!record(value) || !record(value.profile)) fail('profil wajib diisi');
  const state = value as unknown as AppState;
  const profile = state.profile;
  if (typeof profile.name !== 'string' || profile.name.length > 100) fail('nama');
  if (![profile.dailyIncome, profile.dailyBudget, profile.openingBalance].every(money)) fail('nominal profil');
  if (profile.activityAllowance !== undefined && !money(profile.activityAllowance)) fail('tunjangan aktivitas');
  if (profile.payrollCycle !== undefined && !['daily', 'monthly'].includes(profile.payrollCycle)) fail('siklus gaji');
  if (profile.payday !== undefined && (!Number.isInteger(profile.payday) || profile.payday < 1 || profile.payday > 28)) fail('tanggal gajian');
  if (profile.avatarUrl !== undefined && (typeof profile.avatarUrl !== 'string' || profile.avatarUrl.length > 500_000)) fail('foto profil');
  if (!isDateKey(profile.startDate)) fail('tanggal awal');
  if (!Array.isArray(profile.workDays) || profile.workDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(profile.workDays).size !== profile.workDays.length) fail('hari kerja');
  for (const key of ['transactions', 'needs', 'attendance'] as const) {
    if (!Array.isArray(state[key]) || state[key].length > 100_000) fail(key);
  }
  const transactionIds = new Set<string>();
  const incomeDates = new Set<string>();
  for (const transaction of state.transactions) {
    if (!record(transaction) || !text(transaction.id) || !text(transaction.title) || !text(transaction.category) || !money(transaction.amount) || transaction.amount === 0 || !['income', 'expense'].includes(transaction.type) || !isDateKey(transaction.date)) fail('transaksi');
    if (transaction.needId !== undefined && !text(transaction.needId)) fail('tautan kebutuhan');
    if (transaction.budgetTreatment !== undefined && !['daily', 'additional'].includes(transaction.budgetTreatment)) fail('jenis anggaran transaksi');
    if (transaction.attendanceDate !== undefined && (!isDateKey(transaction.attendanceDate) || transaction.attendanceDate !== transaction.date || transaction.type !== 'income')) fail('tautan absensi');
    if (transaction.attendanceDate) {
      if (incomeDates.has(transaction.attendanceDate)) fail('pendapatan absensi ganda');
      incomeDates.add(transaction.attendanceDate);
    }
    if (transactionIds.has(transaction.id)) fail('ID transaksi duplikat');
    transactionIds.add(transaction.id);
  }
  const needIds = new Set<string>();
  for (const need of state.needs) {
    if (!record(need) || !text(need.id) || !text(need.title) || !money(need.amount) || need.amount === 0 || !money(need.saved) || !isDateKey(need.dueDate) || !['debt', 'recurring', 'goal'].includes(need.kind) || !['essential', 'flexible'].includes(need.priority)) fail('kebutuhan');
    if (need.paidAmount !== undefined && (!money(need.paidAmount) || need.paidAmount > need.amount)) fail('jumlah terbayar');
    if (!need.paid && need.paidAmount === need.amount) fail('kebutuhan aktif harus memiliki sisa pembayaran');
    if (need.saved > remainingAmount(need)) fail('alokasi melebihi sisa kebutuhan');
    if (need.paid !== undefined && typeof need.paid !== 'boolean') fail('status kebutuhan');
    if (need.kind === 'recurring' && (!Number.isInteger(need.intervalDays) || need.intervalDays! < 1 || need.intervalDays! > 366)) fail('interval kebutuhan');
    if (needIds.has(need.id)) fail('ID kebutuhan duplikat');
    needIds.add(need.id);
  }
  const dates = new Set<string>();
  for (const attendance of state.attendance) {
    if (!record(attendance) || !isDateKey(attendance.date) || !['present', 'absent', 'holiday', 'half'].includes(attendance.status)) fail('absensi');
    if (attendance.income !== undefined && !money(attendance.income)) fail('pendapatan absensi');
    if (attendance.allowance !== undefined && !money(attendance.allowance)) fail('tunjangan absensi');
    if (attendance.planned !== undefined && typeof attendance.planned !== 'boolean') fail('status rencana absensi');
    if (dates.has(attendance.date)) fail('absensi ganda pada tanggal yang sama');
    dates.add(attendance.date);
  }
  return state;
}
