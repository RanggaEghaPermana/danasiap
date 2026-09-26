/** Financial dates are civil dates in Asia/Jakarta; amounts are integer rupiah. */
export type DateKey = string;
export type NeedKind = 'debt' | 'recurring' | 'goal';
export type FinancialStatus = 'safe' | 'warning' | 'shortfall';

export type PayrollCycle = 'daily' | 'monthly';

export interface Profile {
  name: string;
  /** False for people without a job: no workdays, attendance or salary. Undefined means working. */
  working?: boolean;
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
  /** Scheduled workdays from this date onward count as present unless marked otherwise. */
  autoAttendanceFrom?: DateKey;
  /** Day of the month each budget period starts (1-28, default 1). */
  periodStartDay?: number;
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
  /** Automatic expense of a daily item; its id is `daily:<itemId>:<date>`. */
  dailyItemId?: string;
  /** Part of an expense paid from the leftover pot ("uang sisa"). */
  fromLeftover?: number;
  /** Income set aside for the next period only counts in budgets from this date. */
  effectiveDate?: DateKey;
}

/** Money handed out on scheduled days, such as school fares or cooking money. */
export interface DailyItem {
  id: string;
  title: string;
  amount: number;
  /** JavaScript weekday numbers: Sunday = 0, Saturday = 6. */
  days: number[];
  /** School fares pause on national holidays; cooking usually does not. */
  skipHolidays: boolean;
  /** First date recorded automatically; moves forward when the schedule changes. */
  since: DateKey;
}

/** Planned money that was not used. It stays in hand as the "uang sisa" pot. */
export interface Leftover {
  id: string;
  date: DateKey;
  amount: number;
  title: string;
  /** Set for a daily item; that day's automatic expense is reduced by this amount. */
  itemId?: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  /** Still in stock, so not bought this period. */
  skip?: boolean;
  /** Small JPEG data URL (or https URL) of the product, kept small for cloud sync. */
  image?: string;
}

export interface ShoppingList {
  items: ShoppingItem[];
  /** Day of the month the shopping is planned (1-28). */
  dueDay: number;
  lastDone?: DateKey;
}

export interface TokenPurchase {
  id: string;
  date: DateKey;
  amount: number;
  /** kWh printed on the token receipt. */
  kwh?: number;
}

export interface MeterReading {
  date: DateKey;
  /** Remaining kWh shown on the meter. */
  kwh: number;
}

export interface Electricity {
  purchases: TokenPurchase[];
  readings: MeterReading[];
  /** Planned token spending per 30 days. */
  monthlyBudget?: number;
  /** Installed power in VA, used to estimate kWh when receipts have none. */
  power?: number;
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
  /** Filled in automatically for an unrecorded scheduled workday. */
  auto?: boolean;
}

export interface AppState {
  profile: Profile;
  transactions: Transaction[];
  needs: Need[];
  attendance: Attendance[];
  dailyItems?: DailyItem[];
  leftovers?: Leftover[];
  shopping?: ShoppingList;
  electricity?: Electricity;
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
  if (transaction.type !== 'expense' || transaction.needId || transaction.dailyItemId) return false;
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
  if (state.profile.working === false) return false;
  const entry = state.attendance.find((attendance) => attendance.date === date);
  if (entry) return entry.status === 'present' || entry.status === 'half';
  if (isNationalHoliday(date)) return false;
  return state.profile.workDays.includes(new Date(`${date}T12:00:00Z`).getUTCDay());
}

/**
 * Records every past or current scheduled workday without an entry as present,
 * so users only need to mark the days they did not work. Returns the same
 * object when nothing changes.
 */
export function applyAutoAttendance(state: AppState, today = localDate()): AppState {
  assertDate(today);
  if (state.profile.working === false) return state;
  let next = state;
  const from = state.profile.autoAttendanceFrom;
  if (!from) {
    // Existing records start today; older unrecorded days are left untouched.
    next = reducer(next, { type: 'profile/update', profile: { autoAttendanceFrom: today } });
  }
  let date = next.profile.autoAttendanceFrom! > next.profile.startDate ? next.profile.autoAttendanceFrom! : next.profile.startDate;
  while (date <= today) {
    const entry = next.attendance.find((attendance) => attendance.date === date);
    if (entry?.planned) {
      // A plan made in advance becomes the actual record once its day arrives.
      const { planned: _planned, ...confirmed } = entry;
      next = reducer(next, { type: 'attendance/record', attendance: confirmed }, today);
    } else if (!entry && isWorkday(next, date)) {
      next = reducer(next, { type: 'attendance/record', attendance: { date, status: 'present', auto: true } }, today);
    }
    date = addDays(date, 1);
  }
  return next;
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
    profile: { name: '', dailyIncome: 0, dailyBudget: 0, workDays: [1, 2, 3, 4, 5, 6], openingBalance: 0, startDate: today, autoAttendanceFrom: today, periodStartDay: 1 },
    transactions: [], needs: [], attendance: [], dailyItems: [], leftovers: [],
  };
}

/** Demo data is explicit and never silently mixed into a user's real records. */
export function demoState(today = localDate()): AppState {
  const state = defaultState(today);
  state.profile = { name: 'Rangga', dailyIncome: 120_000, dailyBudget: 0, workDays: [1, 2, 3, 4, 5, 6], openingBalance: 485_000, startDate: addDays(today, -7), activityAllowance: 50_000, payrollCycle: 'monthly', payday: 5, periodStartDay: 1 };
  state.dailyItems = [{ id: 'makan', title: 'Makan', amount: 30_000, days: [0, 1, 2, 3, 4, 5, 6], skipHolidays: false, since: today }];
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

export function needOccurrences(state: AppState, asOf: DateKey, end: DateKey): Need[] {
  return occurrences(state, asOf, end);
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
    const isMonthly = state.profile.payrollCycle === 'monthly' && state.profile.working !== false;
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
    // Daily items not yet recorded on this date are still to be handed out.
    const dailyItems = (state.dailyItems ?? []).reduce((sum, item) =>
      !isScheduled(item, date) || date < item.since || transactions.some((transaction) => transaction.id === dailyTransactionId(item.id, date))
        ? sum : sum + Math.max(0, item.amount - leftoverFor(state, item.id, date)), 0);
    let expenses = dailyExpense + actualExpenses + dailyItems;
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
  | { type: 'daily/set'; items: Array<Omit<DailyItem, 'since'> & { since?: DateKey }> }
  | { type: 'daily/leftover'; itemId: string; date: DateKey; amount: number }
  | { type: 'daily/skipRange'; itemId: string; from: DateKey; to: DateKey }
  | { type: 'shopping/set'; items: ShoppingItem[]; dueDay: number }
  | { type: 'shopping/finish'; id: string; date: DateKey; items: Array<{ id: string; qty: number; price: number; bought: boolean }> }
  | { type: 'electricity/purchase'; purchase: TokenPurchase }
  | { type: 'electricity/reading'; reading: MeterReading }
  | { type: 'electricity/settings'; monthlyBudget?: number; power?: number }
  | { type: 'state/reset'; state: AppState };

export function reducer(state: AppState, action: FinancialAction, today = localDate()): AppState {
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
      const entry: Attendance = { ...action.attendance, planned: action.attendance.date > today };
      if (!entry.auto) delete entry.auto;
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
      if (action.date > today) throw new Error('Pembayaran aktual tidak boleh bertanggal mendatang. Ubah jadwal kebutuhan untuk merencanakannya.');
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
    case 'profile/update': {
      const profile = { ...state.profile, ...action.profile };
      // Returning to work must not backfill the days spent not working.
      if (state.profile.working === false && profile.working !== false) profile.autoAttendanceFrom = today;
      next = { ...state, profile };
      break;
    }
    case 'daily/set': {
      const previous = new Map((state.dailyItems ?? []).map((item) => [item.id, item]));
      const items: DailyItem[] = action.items.map((item) => {
        const old = previous.get(item.id);
        // A changed schedule starts today so earlier days are not backfilled.
        const sameSchedule = old && old.skipHolidays === item.skipHolidays &&
          old.days.length === item.days.length && old.days.every((day) => item.days.includes(day));
        return { id: item.id, title: item.title.trim(), amount: item.amount, days: [...item.days].sort(), skipHolidays: item.skipHolidays,
          since: old ? (sameSchedule ? old.since : (old.since > today ? old.since : today)) : (item.since ?? today) };
      });
      const kept = new Set(items.map((item) => item.id));
      next = { ...state, dailyItems: items,
        leftovers: (state.leftovers ?? []).filter((leftover) => !leftover.itemId || kept.has(leftover.itemId) || leftover.date <= today) };
      break;
    }
    case 'daily/leftover':
      next = setDailyLeftover(state, action.itemId, action.date, action.amount, today);
      break;
    case 'daily/skipRange': {
      assertDate(action.from);
      assertDate(action.to);
      if (action.to < action.from || daysBetween(action.from, action.to) > 366) throw new Error('Rentang libur tidak valid (maksimal setahun).');
      const item = (state.dailyItems ?? []).find((entry) => entry.id === action.itemId);
      if (!item) throw new Error('Pengeluaran harian tidak ditemukan.');
      next = state;
      for (let date = action.from; date <= action.to; date = addDays(date, 1)) {
        if (isScheduled(item, date) && (date >= item.since || next.transactions.some((t) => t.id === dailyTransactionId(item.id, date)))) {
          next = setDailyLeftover(next, item.id, date, item.amount, today);
        }
      }
      break;
    }
    case 'shopping/set': {
      next = syncShoppingNeed({ ...state, shopping: { ...state.shopping, items: action.items, dueDay: action.dueDay } }, today);
      break;
    }
    case 'shopping/finish': {
      assertDate(action.date);
      if (action.date > today) throw new Error('Tanggal belanja tidak boleh di masa depan.');
      const list = state.shopping;
      if (!list) throw new Error('Daftar belanja belum dibuat.');
      const changes = new Map(action.items.map((item) => [item.id, item]));
      const bought = action.items.filter((item) => item.bought);
      const actual = bought.reduce((sum, item) => sum + Math.round(item.qty * item.price), 0);
      if (actual <= 0) throw new Error('Centang barang yang sudah dibeli.');
      // The prices paid become next period's estimate; skipped items return to the list.
      const items = list.items.map((item) => {
        const change = changes.get(item.id);
        const kept = { id: item.id, name: item.name, qty: change?.bought ? change.qty : item.qty, price: change?.bought ? change.price : item.price };
        return item.image ? { ...kept, image: item.image } : kept;
      });
      const active = activeNeed(state, SHOPPING_NEED);
      const planned = active ? remainingAmount(active) : actual;
      let leftovers = state.leftovers ?? [];
      if (active && planned > actual) {
        leftovers = [...leftovers, { id: uniqueId(leftovers.map((l) => l.id), `sisa:belanja:${action.date}`), date: action.date, amount: planned - actual, title: 'Sisa belanja bulanan' }];
      }
      if (state.transactions.some((transaction) => transaction.id === action.id)) return state;
      next = syncShoppingNeed({
        ...state,
        leftovers,
        shopping: { ...list, items, lastDone: action.date },
        needs: state.needs.map((need) => need.id === active?.id ? { ...need, paid: true, paidAmount: need.amount, saved: 0 } : need),
        transactions: [...state.transactions, { id: action.id, title: 'Belanja bulanan', amount: actual, type: 'expense', category: 'Belanja', date: action.date, needId: active?.id ?? 'belanja' }],
      }, today);
      break;
    }
    case 'electricity/purchase': {
      const purchase = action.purchase;
      assertDate(purchase.date);
      if (purchase.date > today) throw new Error('Tanggal pembelian token tidak boleh di masa depan.');
      const electricity = state.electricity ?? { purchases: [], readings: [] };
      if (electricity.purchases.some((entry) => entry.id === purchase.id)) return state;
      const active = activeNeed(state, ELECTRICITY_NEED);
      next = syncElectricityNeed({
        ...state,
        electricity: { ...electricity, purchases: [...electricity.purchases, purchase] },
        needs: state.needs.map((need) => need.id === active?.id ? { ...need, paid: true, paidAmount: need.amount, saved: 0 } : need),
        transactions: [...state.transactions, { id: `token:${purchase.id}`, title: 'Token listrik', amount: purchase.amount, type: 'expense', category: 'Listrik', date: purchase.date, needId: active?.id ?? 'listrik' }],
      }, today);
      break;
    }
    case 'electricity/reading': {
      assertDate(action.reading.date);
      if (action.reading.date > today) throw new Error('Tanggal cek meteran tidak boleh di masa depan.');
      const electricity = state.electricity ?? { purchases: [], readings: [] };
      next = syncElectricityNeed({ ...state, electricity: { ...electricity,
        readings: [...electricity.readings.filter((reading) => reading.date !== action.reading.date), action.reading] } }, today);
      break;
    }
    case 'electricity/settings': {
      const electricity = state.electricity ?? { purchases: [], readings: [] };
      next = syncElectricityNeed({ ...state, electricity: { ...electricity, monthlyBudget: action.monthlyBudget, power: action.power } }, today);
      break;
    }
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
  if (profile.working !== undefined && typeof profile.working !== 'boolean') fail('status bekerja');
  if (profile.periodStartDay !== undefined && (!Number.isInteger(profile.periodStartDay) || profile.periodStartDay < 1 || profile.periodStartDay > 28)) fail('tanggal mulai periode');
  if (profile.autoAttendanceFrom !== undefined && !isDateKey(profile.autoAttendanceFrom)) fail('tanggal absensi otomatis');
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
    if (transaction.dailyItemId !== undefined && (!text(transaction.dailyItemId) || transaction.type !== 'expense')) fail('pengeluaran harian');
    if (transaction.fromLeftover !== undefined && (!money(transaction.fromLeftover) || transaction.fromLeftover > transaction.amount || transaction.type !== 'expense')) fail('pemakaian uang sisa');
    if (transaction.effectiveDate !== undefined && (!isDateKey(transaction.effectiveDate) || transaction.effectiveDate < transaction.date || transaction.type !== 'income')) fail('tanggal berlaku pemasukan');
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
    if (attendance.auto !== undefined && typeof attendance.auto !== 'boolean') fail('status absensi otomatis');
    if (dates.has(attendance.date)) fail('absensi ganda pada tanggal yang sama');
    dates.add(attendance.date);
  }
  const days = (item: unknown) => Array.isArray(item) && item.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) && new Set(item).size === item.length;
  const count = (item: unknown) => typeof item === 'number' && Number.isFinite(item) && item > 0 && item <= 100_000;
  const list = <T,>(item: T[] | undefined, name: string, max = 100_000): T[] => {
    if (item === undefined) return [];
    if (!Array.isArray(item) || item.length > max) fail(name);
    return item;
  };
  const itemIds = new Set<string>();
  for (const item of list(state.dailyItems, 'pengeluaran harian', 100)) {
    if (!record(item) || !text(item.id) || !text(item.title) || !money(item.amount) || item.amount === 0 || !days(item.days) || item.days.length === 0 || typeof item.skipHolidays !== 'boolean' || !isDateKey(item.since)) fail('pengeluaran harian');
    if (itemIds.has(item.id)) fail('ID pengeluaran harian duplikat');
    itemIds.add(item.id);
  }
  const leftoverIds = new Set<string>();
  for (const leftover of list(state.leftovers, 'uang sisa')) {
    if (!record(leftover) || !text(leftover.id) || !isDateKey(leftover.date) || !money(leftover.amount) || leftover.amount === 0 || !text(leftover.title)) fail('uang sisa');
    if (leftover.itemId !== undefined && !text(leftover.itemId)) fail('uang sisa');
    if (leftoverIds.has(leftover.id)) fail('ID uang sisa duplikat');
    leftoverIds.add(leftover.id);
  }
  if (state.shopping !== undefined) {
    const shopping = state.shopping;
    if (!record(shopping) || !Number.isInteger(shopping.dueDay) || shopping.dueDay < 1 || shopping.dueDay > 28 || (shopping.lastDone !== undefined && !isDateKey(shopping.lastDone))) fail('daftar belanja');
    const ids = new Set<string>();
    for (const item of list(shopping.items, 'daftar belanja', 500)) {
      if (!record(item) || !text(item.id) || !text(item.name) || !count(item.qty) || !money(item.price) || (item.skip !== undefined && typeof item.skip !== 'boolean') || ids.has(item.id)) fail('barang belanja');
      if (item.image !== undefined && (typeof item.image !== 'string' || item.image.length > MAX_ITEM_IMAGE || !/^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(item.image))) fail('foto barang belanja');
      ids.add(item.id);
    }
  }
  if (state.electricity !== undefined) {
    const electricity = state.electricity;
    if (!record(electricity) || (electricity.monthlyBudget !== undefined && !money(electricity.monthlyBudget)) ||
        (electricity.power !== undefined && (!Number.isInteger(electricity.power) || electricity.power <= 0 || electricity.power > 1_000_000))) fail('listrik');
    const ids = new Set<string>();
    for (const purchase of list(electricity.purchases, 'token listrik')) {
      if (!record(purchase) || !text(purchase.id) || !isDateKey(purchase.date) || !money(purchase.amount) || purchase.amount === 0 ||
          (purchase.kwh !== undefined && !count(purchase.kwh)) || ids.has(purchase.id)) fail('token listrik');
      ids.add(purchase.id);
    }
    const readingDates = new Set<string>();
    for (const reading of list(electricity.readings, 'meteran listrik')) {
      if (!record(reading) || !isDateKey(reading.date) || typeof reading.kwh !== 'number' || !Number.isFinite(reading.kwh) || reading.kwh < 0 || reading.kwh > 100_000 || readingDates.has(reading.date)) fail('meteran listrik');
      readingDates.add(reading.date);
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Daily items, leftovers ("uang sisa") and period budgets
// ---------------------------------------------------------------------------

const weekday = (date: DateKey) => new Date(`${date}T12:00:00Z`).getUTCDay();

export function isScheduled(item: DailyItem, date: DateKey): boolean {
  if (item.skipHolidays && isNationalHoliday(date)) return false;
  return item.days.includes(weekday(date));
}

export function dailyTransactionId(itemId: string, date: DateKey): string {
  return `daily:${itemId}:${date}`;
}

function leftoverFor(state: AppState, itemId: string, date: DateKey): number {
  return (state.leftovers ?? []).find((leftover) => leftover.id === `sisa:${itemId}:${date}`)?.amount ?? 0;
}

function uniqueId(existing: string[], base: string): string {
  let id = base;
  let sequence = 1;
  while (existing.includes(id)) id = `${base}:${++sequence}`;
  return id;
}

/** Records how much of a day's planned money was not used; it moves into the leftover pot. */
function setDailyLeftover(state: AppState, itemId: string, date: DateKey, amount: number, today: DateKey): AppState {
  assertDate(date);
  const item = (state.dailyItems ?? []).find((entry) => entry.id === itemId);
  if (!item) throw new Error('Pengeluaran harian tidak ditemukan.');
  const transactionId = dailyTransactionId(item.id, date);
  const recorded = state.transactions.some((transaction) => transaction.id === transactionId);
  if (!recorded && (!isScheduled(item, date) || date < item.since)) throw new Error(`${item.title} tidak terjadwal pada tanggal ini.`);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > item.amount) throw new Error(`Sisa harus antara Rp0 dan ${currency(item.amount)}.`);
  const id = `sisa:${item.id}:${date}`;
  const leftovers = (state.leftovers ?? []).filter((leftover) => leftover.id !== id);
  if (amount > 0) leftovers.push({ id, date, amount, title: amount === item.amount ? `${item.title} tidak dipakai` : `Sisa ${item.title}`, itemId: item.id });
  let transactions = state.transactions;
  if (date <= today) {
    const used = item.amount - amount;
    transactions = transactions.filter((transaction) => transaction.id !== transactionId);
    if (used > 0) transactions = [...transactions, { id: transactionId, title: item.title, amount: used, type: 'expense', category: 'Harian', date, dailyItemId: item.id }];
  }
  return { ...state, leftovers, transactions };
}

/**
 * Records each scheduled daily item as spent, from the day it was added up to
 * today, so users only report the days money was not (fully) used. Returns the
 * same object when nothing changes.
 */
export function applyAutoDaily(state: AppState, today = localDate()): AppState {
  assertDate(today);
  const items = state.dailyItems ?? [];
  if (!items.length) return state;
  const recorded = new Set(state.transactions.filter((transaction) => transaction.dailyItemId).map((transaction) => transaction.id));
  const added: Transaction[] = [];
  for (const item of items) {
    for (let date = item.since; date <= today; date = addDays(date, 1)) {
      const id = dailyTransactionId(item.id, date);
      if (recorded.has(id) || !isScheduled(item, date)) continue;
      const used = item.amount - leftoverFor(state, item.id, date);
      if (used > 0) added.push({ id, title: item.title, amount: used, type: 'expense', category: 'Harian', date, dailyItemId: item.id });
    }
  }
  return added.length ? validateState({ ...state, transactions: [...state.transactions, ...added] }) : state;
}

/** The old single "daily budget" becomes one daily item that is recorded automatically from today. */
export function migrateDailyBudget(state: AppState, today = localDate()): AppState {
  if (state.dailyItems !== undefined) return state;
  const amount = state.profile.dailyBudget;
  return {
    ...state,
    profile: amount ? { ...state.profile, dailyBudget: 0 } : state.profile,
    dailyItems: amount > 0 ? [{ id: 'harian-rutin', title: 'Harian rutin', amount, days: [0, 1, 2, 3, 4, 5, 6], skipHolidays: false, since: today }] : [],
  };
}

/** Everything the apps fill in automatically when they open or the day changes. */
export function applyAutomations(state: AppState, today = localDate()): AppState {
  return applyAutoDaily(applyAutoAttendance(migrateDailyBudget(state, today), today), today);
}

export function periodBounds(date: DateKey, startDay = 1): { start: DateKey; end: DateKey } {
  assertDate(date);
  const day = Math.min(28, Math.max(1, Math.floor(startDay)));
  let year = Number(date.slice(0, 4));
  let month = Number(date.slice(5, 7));
  if (Number(date.slice(8, 10)) < day) {
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const start = key(year, month);
  return { start, end: addDays(month === 12 ? key(year + 1, 1) : key(year, month + 1), -1) };
}

/** Income already received but set aside for a period that has not started yet. */
function heldIncome(state: AppState, asOf: DateKey): number {
  return state.transactions
    .filter((transaction) => transaction.type === 'income' && transaction.date <= asOf && transaction.effectiveDate && transaction.effectiveDate > asOf)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export interface DailyItemPlan {
  item: DailyItem;
  /** Days in the period the money is (planned to be) used. */
  days: number;
  total: number;
  today: { scheduled: boolean; recorded: number; leftover: number };
}

export interface PeriodBudget {
  start: DateKey;
  end: DateKey;
  /** Including today. */
  daysLeft: number;
  /** Money in hand for this period, excluding income set aside for the next one. */
  money: number;
  heldForNextPeriod: number;
  /** Money carried over from the previous period. */
  carryOver: number;
  /** Income that arrived during this period so far. */
  periodIncome: number;
  /** Income still expected before the period ends (work income). */
  expectedIncome: number;
  /** Unpaid needs due this period plus money set aside for later needs. */
  obligations: number;
  obligationNeeds: Need[];
  /** Daily items still to be handed out this period. */
  dailyRemaining: number;
  dailyPlans: DailyItemPlan[];
  /** "Uang sisa" of this period that has not been used yet. */
  leftoverPot: number;
  leftovers: Leftover[];
  leftoverUsed: number;
  /** Money free for snacks and wants over the rest of the period. */
  freeMoney: number;
  /** Allowance for today, before today's spending. */
  perDay: number;
  spentToday: number;
  leftToday: number;
  /** Positive when the period's money does not cover its obligations. */
  shortfall: number;
  coveredByLeftover: boolean;
}

function isDiscretionary(transaction: Transaction): boolean {
  return transaction.type === 'expense' && !transaction.needId && !transaction.dailyItemId;
}

export function periodBudget(state: AppState, today = localDate()): PeriodBudget {
  assertDate(today);
  const { start, end } = periodBounds(today, state.profile.periodStartDay);
  const daysLeft = daysBetween(today, end) + 1;
  const heldForNextPeriod = heldIncome(state, today);
  const money = balance(state, today) - heldForNextPeriod;
  const releasedLater = state.transactions
    .filter((transaction) => transaction.type === 'income' && transaction.date <= today && transaction.effectiveDate && transaction.effectiveDate > today && transaction.effectiveDate <= end)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expectedIncome = forecast(state, { asOf: today, horizonDays: daysLeft }).days.reduce((sum, day) => sum + day.income, 0) + releasedLater;

  const obligationNeeds = occurrences(state, today, end);
  const obligations = obligationNeeds.reduce((sum, need) => sum + remainingAmount(need), 0) +
    state.needs.filter((need) => need.dueDate > end).reduce((sum, need) => sum + Math.min(need.saved, remainingAmount(need)), 0);

  let dailyRemaining = 0;
  const dailyPlans = (state.dailyItems ?? []).map((item): DailyItemPlan => {
    let days = 0;
    let total = 0;
    for (let date = item.since > start ? item.since : start; date <= end; date = addDays(date, 1)) {
      if (!isScheduled(item, date)) continue;
      const recorded = state.transactions.find((transaction) => transaction.id === dailyTransactionId(item.id, date));
      const left = leftoverFor(state, item.id, date);
      const planned = recorded ? recorded.amount : Math.max(0, item.amount - left);
      if (planned > 0) days++;
      total += planned;
      // Future days keep the full amount reserved; an unused part joins the pot on that day.
      if (date > today) dailyRemaining += item.amount;
      else if (!recorded) dailyRemaining += Math.max(0, item.amount - left);
    }
    const scheduled = isScheduled(item, today) && today >= item.since;
    const recorded = state.transactions.find((transaction) => transaction.id === dailyTransactionId(item.id, today))?.amount ?? 0;
    return { item, days, total, today: { scheduled, recorded, leftover: leftoverFor(state, item.id, today) } };
  });

  const inPeriod = (date: DateKey) => date >= start && date <= today;
  const leftovers = (state.leftovers ?? []).filter((leftover) => inPeriod(leftover.date)).sort((a, b) => b.date.localeCompare(a.date));
  const leftoverUsed = state.transactions.filter((transaction) => transaction.type === 'expense' && inPeriod(transaction.date))
    .reduce((sum, transaction) => sum + (transaction.fromLeftover ?? 0), 0);
  const leftoverPot = leftovers.reduce((sum, leftover) => sum + leftover.amount, 0) - leftoverUsed;

  const spentToday = state.transactions.filter((transaction) => transaction.date === today && isDiscretionary(transaction))
    .reduce((sum, transaction) => sum + transaction.amount - (transaction.fromLeftover ?? 0), 0);
  const freeMoney = money + expectedIncome - obligations - dailyRemaining - Math.max(0, leftoverPot);
  const shortfall = Math.max(0, -freeMoney);
  // Once obligations are at risk there is no allowance left to offer.
  const perDay = shortfall > 0 ? 0 : Math.floor((freeMoney + spentToday) / daysLeft);

  const beforeStart = addDays(start, -1);
  const carryOver = state.profile.startDate < start ? balance(state, beforeStart) - heldIncome(state, beforeStart) : 0;
  const periodIncome = state.transactions.filter((transaction) => {
    const counted = transaction.effectiveDate ?? transaction.date;
    return transaction.type === 'income' && transaction.date <= today && counted >= start && counted <= today;
  }).reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    start, end, daysLeft, money, heldForNextPeriod, carryOver, periodIncome, expectedIncome,
    obligations, obligationNeeds, dailyRemaining, dailyPlans, leftoverPot, leftovers, leftoverUsed,
    freeMoney, perDay, spentToday, leftToday: perDay - spentToday, shortfall,
    coveredByLeftover: shortfall > 0 && leftoverPot >= shortfall,
  };
}

export interface PeriodSummary {
  start: DateKey;
  end: DateKey;
  /** Leftovers of that period that were not spent from the pot. */
  leftover: number;
  /** Money in hand when the period closed. */
  endingMoney: number;
}

/** Closed periods, newest first, for the "uang sisa per periode" history. */
export function periodHistory(state: AppState, today = localDate(), count = 6): PeriodSummary[] {
  const startDay = state.profile.periodStartDay;
  const result: PeriodSummary[] = [];
  let { start } = periodBounds(today, startDay);
  for (let index = 0; index < count; index++) {
    const period = periodBounds(addDays(start, -1), startDay);
    if (period.end < state.profile.startDate) break;
    const inPeriod = (date: DateKey) => date >= period.start && date <= period.end;
    const leftover = (state.leftovers ?? []).filter((entry) => inPeriod(entry.date)).reduce((sum, entry) => sum + entry.amount, 0) -
      state.transactions.filter((transaction) => inPeriod(transaction.date)).reduce((sum, transaction) => sum + (transaction.fromLeftover ?? 0), 0);
    result.push({ start: period.start, end: period.end, leftover, endingMoney: balance(state, period.end) - heldIncome(state, period.end) });
    start = period.start;
  }
  return result;
}

export type PurchaseVerdict = 'jatah' | 'sisa' | 'turun' | 'bahaya';

export interface PurchaseCheck {
  verdict: PurchaseVerdict;
  fromAllowance: number;
  fromLeftover: number;
  leftoverAfter: number;
  /** Allowance per day for the rest of the period after buying. */
  perDayAfter: number;
  shortfall: number;
}

/** Pays from today's allowance first, then the leftover pot, then the rest of the period. */
export function checkPurchase(budget: PeriodBudget, amount: number): PurchaseCheck {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Masukkan harga yang valid.');
  const fromAllowance = Math.min(amount, Math.max(0, budget.leftToday));
  const fromLeftover = Math.min(amount - fromAllowance, Math.max(0, budget.leftoverPot));
  const rest = amount - fromAllowance - fromLeftover;
  const freeAfter = budget.freeMoney - fromAllowance - rest;
  const remainingDays = budget.daysLeft - 1;
  return {
    verdict: rest === 0 ? (fromLeftover > 0 ? 'sisa' : 'jatah') : freeAfter >= 0 ? 'turun' : 'bahaya',
    fromAllowance,
    fromLeftover,
    leftoverAfter: Math.max(0, budget.leftoverPot) - fromLeftover,
    perDayAfter: remainingDays > 0 ? Math.max(0, Math.floor(freeAfter / remainingDays)) : 0,
    shortfall: Math.max(0, -freeAfter),
  };
}

// ---------------------------------------------------------------------------
// Monthly shopping list
// ---------------------------------------------------------------------------

const SHOPPING_NEED = 'belanja';
/** Characters per product photo; about 60 KB so a full list stays well under the 2 MB sync limit. */
export const MAX_ITEM_IMAGE = 80_000;
const ELECTRICITY_NEED = 'listrik';

function activeNeed(state: AppState, prefix: string): Need | undefined {
  return state.needs.find((need) => !need.paid && (need.id === prefix || need.id.startsWith(`${prefix}:`)));
}

export function isShoppingNeed(need: Need): boolean {
  return need.id === SHOPPING_NEED || need.id.startsWith(`${SHOPPING_NEED}:`);
}

export function isElectricityNeed(need: Need): boolean {
  return need.id === ELECTRICITY_NEED || need.id.startsWith(`${ELECTRICITY_NEED}:`);
}

export function shoppingTotal(list?: ShoppingList): number {
  return (list?.items ?? []).filter((item) => !item.skip).reduce((sum, item) => sum + Math.round(item.qty * item.price), 0);
}

/** This period's shopping day, or next period's once this period's shopping is done. */
export function shoppingDueDate(state: AppState, today = localDate()): DateKey {
  const startDay = state.profile.periodStartDay;
  let { start, end } = periodBounds(today, startDay);
  if (state.shopping?.lastDone && state.shopping.lastDone >= start) ({ start, end } = periodBounds(addDays(end, 1), startDay));
  const day = state.shopping?.dueDay ?? 1;
  for (let date = start; date <= end; date = addDays(date, 1)) if (Number(date.slice(8, 10)) === day) return date;
  return start;
}

/** Keeps one open "Belanja bulanan" need whose amount is the list total. */
function syncShoppingNeed(state: AppState, today: DateKey): AppState {
  const total = shoppingTotal(state.shopping);
  const active = activeNeed(state, SHOPPING_NEED);
  if (total === 0) return active && !active.paidAmount ? { ...state, needs: state.needs.filter((need) => need.id !== active.id) } : state;
  const dueDate = shoppingDueDate(state, today);
  if (active) {
    const paid = active.paidAmount ?? 0;
    if (paid >= total) return state;
    return { ...state, needs: state.needs.map((need) => need.id === active.id ? { ...need, amount: total, saved: Math.min(need.saved, total - paid), dueDate } : need) };
  }
  // A 31-day interval never repeats inside one period, so the list is counted once per period.
  const id = uniqueId(state.needs.map((need) => need.id), `${SHOPPING_NEED}:${dueDate}`);
  return { ...state, needs: [...state.needs, { id, title: 'Belanja bulanan', amount: total, saved: 0, dueDate, kind: 'recurring', intervalDays: 31, priority: 'essential' }] };
}

// ---------------------------------------------------------------------------
// Prepaid electricity tokens
// ---------------------------------------------------------------------------

/** Approximate PLN prepaid tariffs (Rp/kWh) by installed power, used only when receipts have no kWh. */
export const TOKEN_TARIFF: Record<number, number> = { 450: 415, 900: 1352, 1300: 1445, 2200: 1445, 3500: 1700, 5500: 1700 };

function tariffFor(power?: number): number | undefined {
  if (!power) return undefined;
  let rate = TOKEN_TARIFF[450];
  for (const [minimum, price] of Object.entries(TOKEN_TARIFF).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (power >= Number(minimum)) rate = price;
  }
  return rate;
}

export interface ElectricityEstimate {
  purchases: number;
  /** Amount of the latest purchase, used for the next one. */
  typicalAmount: number;
  pricePerKwh?: number;
  /** True when the price comes from receipts rather than the tariff table. */
  priceFromReceipts: boolean;
  costPerDay?: number;
  kwhPerDay?: number;
  /** How many days the typical purchase lasts. */
  daysPerPurchase?: number;
  remainingKwh?: number;
  daysLeft?: number;
  nextPurchaseDate?: DateKey;
  /** Cost per 30 days. */
  monthlyCost?: number;
  target?: { costPerDay: number; kwhPerDay?: number; overBudget: number; saveKwhPerDay?: number };
}

export function electricityEstimate(state: AppState, today = localDate()): ElectricityEstimate {
  assertDate(today);
  const electricity = state.electricity;
  const byDate = <T extends { date: DateKey }>(a: T, b: T) => a.date.localeCompare(b.date);
  const purchases = [...(electricity?.purchases ?? [])].sort(byDate);
  const readings = [...(electricity?.readings ?? [])].sort(byDate);
  const last = purchases[purchases.length - 1];
  const receipts = purchases.filter((purchase) => purchase.kwh);
  const pricePerKwh = receipts.length
    ? receipts.reduce((sum, purchase) => sum + purchase.amount, 0) / receipts.reduce((sum, purchase) => sum + purchase.kwh!, 0)
    : tariffFor(electricity?.power);
  const kwhOf = (purchase: TokenPurchase) => purchase.kwh ?? (pricePerKwh ? purchase.amount / pricePerKwh : undefined);
  // Purchases on a reading's own date are assumed to be included in that reading.
  const boughtBetween = (after: DateKey, until: DateKey) => {
    let total = 0;
    for (const purchase of purchases) {
      if (purchase.date <= after || purchase.date > until) continue;
      const kwh = kwhOf(purchase);
      if (kwh === undefined) return undefined;
      total += kwh;
    }
    return total;
  };

  let kwhPerDay: number | undefined;
  for (let index = readings.length - 1; index > 0 && kwhPerDay === undefined; index--) {
    const before = readings[index - 1];
    const after = readings[index];
    const days = daysBetween(before.date, after.date);
    const bought = boughtBetween(before.date, after.date);
    if (days > 0 && bought !== undefined && before.kwh + bought - after.kwh > 0) kwhPerDay = (before.kwh + bought - after.kwh) / days;
  }
  let costPerDay = kwhPerDay !== undefined && pricePerKwh ? kwhPerDay * pricePerKwh : undefined;
  if (costPerDay === undefined && purchases.length >= 2) {
    const span = daysBetween(purchases[0].date, last.date);
    // Everything bought before the latest purchase was used up over that span.
    if (span > 0) costPerDay = purchases.slice(0, -1).reduce((sum, purchase) => sum + purchase.amount, 0) / span;
  }
  if (kwhPerDay === undefined && costPerDay !== undefined && pricePerKwh) kwhPerDay = costPerDay / pricePerKwh;

  const typicalAmount = last?.amount ?? 0;
  let remainingKwh: number | undefined;
  let daysLeft: number | undefined;
  let nextPurchaseDate: DateKey | undefined;
  const reading = readings[readings.length - 1];
  if (reading && kwhPerDay) {
    const bought = boughtBetween(reading.date, today);
    if (bought !== undefined) {
      remainingKwh = Math.max(0, reading.kwh + bought - kwhPerDay * daysBetween(reading.date, today));
      daysLeft = remainingKwh / kwhPerDay;
      nextPurchaseDate = addDays(today, Math.floor(daysLeft));
    }
  }
  if (nextPurchaseDate === undefined && last && costPerDay) {
    nextPurchaseDate = addDays(last.date, Math.max(1, Math.round(last.amount / costPerDay)));
    daysLeft = Math.max(0, daysBetween(today, nextPurchaseDate));
  }
  const monthlyCost = costPerDay !== undefined ? Math.round(costPerDay * 30) : undefined;
  const budget = electricity?.monthlyBudget;
  const targetKwh = budget && pricePerKwh ? budget / 30 / pricePerKwh : undefined;
  return {
    purchases: purchases.length,
    typicalAmount,
    pricePerKwh,
    priceFromReceipts: receipts.length > 0,
    costPerDay: costPerDay !== undefined ? Math.round(costPerDay) : undefined,
    kwhPerDay,
    daysPerPurchase: costPerDay ? typicalAmount / costPerDay : undefined,
    remainingKwh,
    daysLeft,
    nextPurchaseDate,
    monthlyCost,
    target: budget ? {
      costPerDay: Math.floor(budget / 30),
      kwhPerDay: targetKwh,
      overBudget: monthlyCost !== undefined ? Math.max(0, monthlyCost - budget) : 0,
      saveKwhPerDay: kwhPerDay !== undefined && targetKwh !== undefined ? Math.max(0, kwhPerDay - targetKwh) : undefined,
    } : undefined,
  };
}

/** Replaces the open "Token listrik" need with the latest estimate of the next purchase. */
function syncElectricityNeed(state: AppState, today: DateKey): AppState {
  const estimate = electricityEstimate(state, today);
  const open = state.needs.filter((need) => isElectricityNeed(need) && !need.paid && !need.paidAmount);
  const saved = open.reduce((sum, need) => sum + need.saved, 0);
  let needs = state.needs.filter((need) => !open.includes(need));
  if (estimate.typicalAmount > 0) {
    const last = [...state.electricity!.purchases].sort((a, b) => a.date.localeCompare(b.date)).pop()!;
    const due = estimate.nextPurchaseDate ?? addDays(last.date, 30);
    const dueDate = due < today ? today : due;
    needs = [...needs, {
      id: uniqueId(needs.map((need) => need.id), `${ELECTRICITY_NEED}:${dueDate}`), title: 'Token listrik',
      amount: estimate.typicalAmount, saved: Math.min(saved, estimate.typicalAmount), dueDate, kind: 'recurring',
      intervalDays: Math.min(366, Math.max(1, Math.round(estimate.daysPerPurchase ?? 30))), priority: 'essential',
    }];
  }
  return { ...state, needs };
}
