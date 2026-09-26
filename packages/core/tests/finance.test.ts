import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays, applyAutoAttendance, applyAutoDaily, applyAutomations, balance, calculatePayroll, checkPurchase, electricityEstimate,
  daysBetween, isDateKey, migrateDailyBudget, periodBounds, periodBudget, periodHistory, shoppingTotal, defaultState, demoState, forecast, getHoliday, getMonthBounds,
  getPreviousMonthBounds, isNationalHoliday, isWorkday, localDate, reducer, remainingAmount, validateState, type AppState, type Need,
} from '../src/index';

const MONDAY = '2026-09-21';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${MONDAY}T05:00:00Z`));
});
afterEach(() => vi.useRealTimers());
function setup(overrides: Partial<AppState['profile']> = {}): AppState {
  const state = defaultState(MONDAY);
  state.profile = { ...state.profile, name: 'Tester', dailyIncome: 100_000, workDays: [1, 2, 3, 4, 5], ...overrides };
  return state;
}
function need(overrides: Partial<Need> = {}): Need {
  return { id: 'debt', title: 'Utang', amount: 300_000, saved: 0, dueDate: '2026-09-25', kind: 'debt', priority: 'essential', ...overrides };
}

describe('civil dates and money state', () => {
  it('uses Jakarta midnight rather than the machine timezone', () => {
    expect(localDate(new Date('2026-09-20T17:01:00Z'))).toBe(MONDAY);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('starts real users with zero data, while demos are explicit and valid', () => {
    expect(balance(defaultState(MONDAY), MONDAY)).toBe(0);
    expect(defaultState(MONDAY).needs).toEqual([]);
    expect(validateState(demoState(MONDAY)).needs).toHaveLength(3);
  });

  it('does not include a future transaction in current balance', () => {
    const state = setup({ openingBalance: 100_000 });
    state.transactions.push({ id: 'future', title: 'Bonus', amount: 500_000, type: 'income', category: 'Lainnya', date: '2026-09-25' });
    expect(balance(state, MONDAY)).toBe(100_000);
    expect(forecast(state, { asOf: MONDAY, horizonDays: 5 }).projectedBalance).toBe(1_100_000);
  });

  it('deducts an expense added later with yesterday’s date from today’s starting cash', () => {
    const state = setup({ openingBalance: 100_000, startDate: MONDAY, dailyIncome: 0 });
    const updated = reducer(state, {
      type: 'transaction/add',
      transaction: {
        id: 'backdated-expense',
        title: 'Makan kemarin',
        amount: 25_000,
        type: 'expense',
        category: 'Makan',
        date: '2026-09-20',
      },
    });

    expect(balance(state, MONDAY)).toBe(100_000);
    expect(balance(updated, MONDAY)).toBe(75_000);
    expect(forecast(updated, { asOf: MONDAY, horizonDays: 1 }).currentBalance).toBe(75_000);
  });
});

describe('calendar-aware forecast', () => {
  it('excludes weekends and planned holidays from income, but retains living costs', () => {
    const state = setup({ dailyBudget: 10_000 });
    state.attendance = [{ date: '2026-09-23', status: 'holiday' }];
    const result = forecast(state, { asOf: MONDAY, horizonDays: 7 });
    expect(result.workdays).toBe(4);
    expect(result.expectedIncome).toBe(400_000);
    expect(result.plannedExpenses).toBe(70_000);
    expect(result.days[2].income).toBe(0);
    expect(result.days[5].income).toBe(0);
  });

  it('replaces a planned workday with a holiday without inventing lost actual earnings', () => {
    const tuesday = '2026-09-22';
    let state = reducer(setup(), { type: 'attendance/record', attendance: { date: tuesday, status: 'present' } });
    state = reducer(state, { type: 'attendance/record', attendance: { date: tuesday, status: 'holiday' } });
    const result = forecast(state, { asOf: MONDAY, horizonDays: 2 });
    expect(result.currentBalance).toBe(0);
    expect(result.expectedIncome).toBe(100_000);
    expect(result.workdays).toBe(1);
    expect(result.days[1].income).toBe(0);
    expect(state.transactions).toEqual([]);
  });

  it('shows a new debt shortage when one workday is missed', () => {
    const state = setup();
    state.needs = [need({ amount: 500_000 })];
    const ordinary = forecast(state, { asOf: MONDAY, horizonDays: 5 });
    const missed = forecast(state, { asOf: MONDAY, horizonDays: 5, absentDates: [MONDAY] });
    expect(ordinary.shortfall).toBe(0);
    expect(missed.shortfall).toBe(100_000);
    expect(missed.risks[0]).toMatchObject({ needId: 'debt', shortfall: 100_000 });
    expect(missed.requiredDaily).toBe(125_000);
    expect(state.attendance).toEqual([]);
  });

  it('preserves an early shortfall even if later paydays make the ending balance positive', () => {
    const state = setup();
    state.needs = [need({ amount: 250_000, dueDate: MONDAY })];
    const result = forecast(state, { asOf: MONDAY, horizonDays: 5 });
    expect(result.projectedBalance).toBe(250_000);
    expect(result.minBalance).toBe(-150_000);
    expect(result.shortfall).toBe(150_000);
    expect(result.safeToSpend).toBe(0);
  });

  it('deducts virtual savings once, not as an expense', () => {
    const state = setup({ openingBalance: 500_000, dailyIncome: 0 });
    state.needs = [need({ amount: 200_000, saved: 200_000 })];
    const result = forecast(state, { asOf: MONDAY, horizonDays: 5 });
    expect(result.currentBalance).toBe(500_000);
    expect(result.projectedBalance).toBe(300_000);
    expect(result.safeToSpend).toBe(300_000);
  });

  it('protects allocations even when their deadline is outside the forecast window', () => {
    const state = setup({ openingBalance: 500_000 });
    state.needs = [need({ amount: 300_000, saved: 250_000, dueDate: '2027-01-01' })];
    expect(forecast(state, { asOf: MONDAY, horizonDays: 7 }).safeToSpend).toBe(250_000);
  });

  it('counts a recorded lunch toward today’s budget without charging it twice', () => {
    const state = setup({ openingBalance: 100_000, dailyIncome: 0, dailyBudget: 30_000 });
    state.transactions = [{ id: 'lunch', title: 'Makan', amount: 25_000, type: 'expense', category: 'Makan', date: MONDAY }];
    const result = forecast(state, { asOf: MONDAY, horizonDays: 1 });
    expect(result.currentBalance).toBe(75_000);
    expect(result.days[0].expenses).toBe(5_000);
    expect(result.projectedBalance).toBe(70_000);
  });

  it('retains routine spending after an unexpected expense instead of masking the impact', () => {
    const state = setup({ openingBalance: 200_000, dailyIncome: 0, dailyBudget: 30_000 });
    state.transactions = [{ id: 'emergency', title: 'Ban bocor', amount: 50_000, type: 'expense', category: 'Mendadak', date: MONDAY }];
    const result = forecast(state, { asOf: MONDAY, horizonDays: 1 });
    expect(result.currentBalance).toBe(150_000);
    expect(result.plannedExpenses).toBe(30_000);
    expect(result.projectedBalance).toBe(120_000);
    state.transactions[0].category = 'Motor';
    state.transactions[0].budgetTreatment = 'additional';
    expect(forecast(state, { asOf: MONDAY, horizonDays: 1 }).projectedBalance).toBe(120_000);
  });

  it('charges future routine spending only once and future emergencies in addition to the budget', () => {
    const state = setup({ openingBalance: 200_000, dailyIncome: 0, dailyBudget: 30_000 });
    state.transactions = [
      { id: 'future-food', title: 'Makan', amount: 50_000, type: 'expense', category: 'Makan', date: '2026-09-22' },
      { id: 'future-emergency', title: 'Ban bocor', amount: 40_000, type: 'expense', category: 'Mendadak', date: '2026-09-23' },
    ];
    const result = forecast(state, { asOf: MONDAY, horizonDays: 3 });
    expect(result.currentBalance).toBe(200_000);
    expect(result.days.map((day) => day.expenses)).toEqual([30_000, 50_000, 70_000]);
    expect(result.projectedBalance).toBe(50_000);
  });

  it('preserves separate bonus income when simulating a missed future workday', () => {
    const tuesday = '2026-09-22';
    const state = reducer(setup(), { type: 'attendance/record', attendance: { date: tuesday, status: 'present' } });
    state.transactions.push({ id: 'bonus', title: 'Hadiah', type: 'income', category: 'Hadiah', amount: 50_000, date: tuesday });
    const result = forecast(state, { asOf: MONDAY, horizonDays: 2, absentDates: [tuesday] });
    expect(result.currentBalance).toBe(0);
    expect(result.days[1].income).toBe(50_000);
    expect(result.projectedBalance).toBe(150_000);
  });

  it('does not make unconfirmed earnings available to spend right now', () => {
    const result = forecast(setup({ openingBalance: 20_000 }), { asOf: MONDAY, horizonDays: 1 });
    expect(result.currentBalance).toBe(20_000);
    expect(result.expectedIncome).toBe(100_000);
    expect(result.projectedBalance).toBe(120_000);
    expect(result.safeToSpend).toBe(20_000);
  });

  it('projects repeat purchases, and recalculates after postponing them', () => {
    const state = setup({ openingBalance: 500_000, dailyIncome: 0 });
    state.needs = [need({ kind: 'recurring', amount: 100_000, dueDate: MONDAY, intervalDays: 7 })];
    expect(forecast(state, { asOf: MONDAY, horizonDays: 15 }).plannedExpenses).toBe(300_000);
    const delayed = reducer(state, { type: 'need/reschedule', id: 'debt', dueDate: '2026-09-23' });
    expect(forecast(delayed, { asOf: MONDAY, horizonDays: 15 }).plannedExpenses).toBe(200_000);
  });

  it('returns finite figures and a shortage when there are no earning days', () => {
    const state = setup({ workDays: [] });
    state.needs = [need({ dueDate: MONDAY })];
    const result = forecast(state, { asOf: MONDAY, horizonDays: 7 });
    expect(result.workdays).toBe(0);
    expect(Number.isFinite(result.requiredDaily)).toBe(true);
    expect(result.shortfall).toBe(300_000);
  });

  it('can meet a near-term debt without workdays when real cash already covers it', () => {
    const state = setup({ openingBalance: 400_000, workDays: [] });
    state.needs = [need({ dueDate: MONDAY })];
    const result = forecast(state, { asOf: MONDAY, horizonDays: 7 });
    expect(result.expectedIncome).toBe(0);
    expect(result.workdays).toBe(0);
    expect(result.requiredDaily).toBe(0);
    expect(result.shortfall).toBe(0);
    expect(result.safeToSpend).toBe(100_000);
  });
});

describe('attendance and payments', () => {
  it('records a payday once, then corrects half-day and absence without duplicate money', () => {
    let state = setup();
    const action = { type: 'attendance/record', attendance: { date: MONDAY, status: 'present' } } as const;
    state = reducer(reducer(state, action), action);
    expect(state.transactions).toHaveLength(1);
    expect(balance(state, MONDAY)).toBe(100_000);
    expect(forecast(state, { asOf: MONDAY, horizonDays: 1 }).expectedIncome).toBe(0);
    state = reducer(state, { type: 'attendance/record', attendance: { date: MONDAY, status: 'half' } });
    expect(balance(state, MONDAY)).toBe(50_000);
    state = reducer(state, { type: 'attendance/record', attendance: { date: MONDAY, status: 'absent' } });
    expect(balance(state, MONDAY)).toBe(0);
    expect(forecast(state, { asOf: MONDAY, horizonDays: 1 }).expectedIncome).toBe(0);
  });

  it('allows actual work on an ordinary day off', () => {
    const sunday = '2026-09-27';
    vi.setSystemTime(new Date(`${sunday}T05:00:00Z`));
    const state = reducer(setup(), { type: 'attendance/record', attendance: { date: sunday, status: 'present', income: 150_000 } });
    expect(balance(state, sunday)).toBe(150_000);
    expect(forecast(state, { asOf: sunday, horizonDays: 1 }).days[0].workday).toBe(true);
  });

  it('keeps future attendance planned and does not turn it into actual money when time passes', () => {
    const tuesday = '2026-09-22';
    let state = reducer(setup(), { type: 'attendance/record', attendance: { date: tuesday, status: 'present' } });
    expect(state.attendance[0].planned).toBe(true);
    expect(state.transactions).toHaveLength(0);
    expect(forecast(state, { asOf: MONDAY, horizonDays: 2 }).expectedIncome).toBe(200_000);
    vi.setSystemTime(new Date(`${tuesday}T05:00:00Z`));
    expect(balance(state)).toBe(0);
    expect(forecast(state, { asOf: tuesday, horizonDays: 1 }).expectedIncome).toBe(100_000);
    state = reducer(state, { type: 'attendance/record', attendance: { date: tuesday, status: 'present' } });
    expect(state.attendance[0].planned).toBe(false);
    expect(balance(state)).toBe(100_000);
    expect(forecast(state, { asOf: tuesday, horizonDays: 1 }).expectedIncome).toBe(0);
  });

  it('removes expected pay when a planned workday is confirmed as missed', () => {
    const tuesday = '2026-09-22';
    let state = reducer(setup(), { type: 'attendance/record', attendance: { date: tuesday, status: 'half' } });
    expect(forecast(state, { asOf: tuesday, horizonDays: 1 }).expectedIncome).toBe(50_000);
    vi.setSystemTime(new Date(`${tuesday}T05:00:00Z`));
    state = reducer(state, { type: 'attendance/record', attendance: { date: tuesday, status: 'absent' } });
    expect(balance(state)).toBe(0);
    expect(forecast(state, { asOf: tuesday, horizonDays: 1 }).expectedIncome).toBe(0);
  });

  it('simulates removing actual work without mutating the source ledger', () => {
    const state = reducer(setup(), { type: 'attendance/record', attendance: { date: MONDAY, status: 'present' } });
    const result = forecast(state, { asOf: MONDAY, horizonDays: 1, absentDates: [MONDAY] });
    expect(result.currentBalance).toBe(0);
    expect(result.expectedIncome).toBe(0);
    expect(balance(state, MONDAY)).toBe(100_000);
  });

  it('pays a recurring need atomically and starts its next cycle from the actual payment date', () => {
    const state = setup({ openingBalance: 500_000, dailyIncome: 0 });
    state.needs = [need({ amount: 100_000, saved: 70_000, kind: 'recurring', intervalDays: 7 })];
    const paid = reducer(state, { type: 'need/pay', id: 'debt', date: MONDAY });
    expect(paid.transactions).toHaveLength(1);
    expect(balance(paid, MONDAY)).toBe(400_000);
    expect(paid.needs[0].paid).toBe(true);
    expect(paid.needs[1]).toMatchObject({ dueDate: '2026-09-28', saved: 0, paid: false });
    expect(forecast(paid, { asOf: MONDAY, horizonDays: 7 }).plannedExpenses).toBe(0);
    expect(reducer(paid, { type: 'need/pay', id: 'debt', date: MONDAY })).toBe(paid);
  });

  it('records two early recurring purchases on the same day without occurrence ID collisions', () => {
    let state = setup({ openingBalance: 500_000, dailyIncome: 0 });
    state.needs = [need({ amount: 100_000, kind: 'recurring', intervalDays: 7 })];
    state = reducer(state, { type: 'need/pay', id: 'debt', date: MONDAY });
    const nextId = state.needs.find((entry) => !entry.paid)!.id;
    state = reducer(state, { type: 'need/pay', id: nextId, date: MONDAY });
    expect(state.transactions).toHaveLength(2);
    expect(new Set(state.needs.map((entry) => entry.id)).size).toBe(3);
    expect(state.needs.filter((entry) => !entry.paid)).toHaveLength(1);
    expect(balance(state, MONDAY)).toBe(300_000);
    expect(forecast(state, { asOf: MONDAY, horizonDays: 8 }).plannedExpenses).toBe(100_000);
  });

  it('rejects future actual payments so they cannot prematurely clear a due debt', () => {
    const state = setup();
    state.needs = [need({ dueDate: MONDAY })];
    expect(() => reducer(state, { type: 'need/pay', id: 'debt', date: '2026-09-22' })).toThrow(/mendatang/);
    expect(state.needs[0].paid).toBeUndefined();
    expect(state.transactions).toEqual([]);
  });

  it('keeps only the unpaid remainder in forecasts after a partial debt payment', () => {
    const state = setup({ openingBalance: 500_000, dailyIncome: 0 });
    state.needs = [need({ saved: 150_000 })];
    const paid = reducer(state, { type: 'need/pay', id: 'debt', date: MONDAY, amount: 100_000 });
    expect(remainingAmount(paid.needs[0])).toBe(200_000);
    expect(paid.needs[0].saved).toBe(50_000);
    expect(forecast(paid, { asOf: MONDAY, horizonDays: 5 }).projectedBalance).toBe(200_000);
  });

  it('does not duplicate retried add operations', () => {
    const transaction = { id: 'once', title: 'Makan', amount: 20_000, type: 'expense', category: 'Makan', date: MONDAY } as const;
    const state = reducer(setup(), { type: 'transaction/add', transaction });
    expect(reducer(state, { type: 'transaction/add', transaction }).transactions).toHaveLength(1);
  });

  it('edits a need and allocates existing cash while preserving its identity and payment history', () => {
    const state = setup({ openingBalance: 500_000 });
    state.needs = [need({ paidAmount: 50_000 })];
    const updated = reducer(state, { type: 'need/update', id: 'debt', changes: { title: 'Cicilan', amount: 350_000, saved: 200_000, paidAmount: undefined } });
    expect(updated.needs[0]).toMatchObject({ id: 'debt', title: 'Cicilan', amount: 350_000, saved: 200_000, paidAmount: 50_000 });
    expect(balance(updated, MONDAY)).toBe(500_000);
    expect(() => reducer(state, { type: 'need/update', id: 'debt', changes: { id: 'different' } })).toThrow(/ID/);
    expect(() => reducer(state, { type: 'need/update', id: 'debt', changes: { paidAmount: 0 } })).toThrow(/pembayaran/);
    expect(() => reducer(state, { type: 'need/update', id: 'debt', changes: { amount: 50_000 } })).toThrow(/sisa pembayaran/);
  });

  it('rejects additional allocations beyond actual cash, including when adding another need', () => {
    const state = setup({ openingBalance: 100_000 });
    state.needs = [need({ saved: 80_000 })];
    expect(() => reducer(state, { type: 'need/update', id: 'debt', changes: { saved: 120_000 } })).toThrow(/saldo tersedia/);
    expect(() => reducer(state, { type: 'need/add', need: need({ id: 'second', saved: 30_000 }) })).toThrow(/saldo tersedia/);
    expect(state.needs[0].saved).toBe(80_000);
  });

  it('still records expenses and permits allocation reductions after allocated cash was spent', () => {
    let state = setup({ openingBalance: 100_000 });
    state.needs = [need({ saved: 80_000 })];
    state = reducer(state, { type: 'transaction/add', transaction: { id: 'urgent', title: 'Dokter', amount: 80_000, type: 'expense', category: 'Darurat', date: localDate() } });
    expect(validateState(state)).toBe(state);
    state = reducer(state, { type: 'need/update', id: 'debt', changes: { saved: 70_000 } });
    expect(state.needs[0].saved).toBe(70_000);
    expect(() => reducer(state, { type: 'need/update', id: 'debt', changes: { saved: 75_000 } })).toThrow(/saldo tersedia/);
    state = reducer(state, { type: 'need/update', id: 'debt', changes: { saved: 20_000 } });
    expect(state.needs[0].saved).toBe(20_000);
  });
});

describe('boundary validation', () => {
  it('rejects bad dates, negative money, duplicate IDs and invalid recurrence intervals', () => {
    expect(() => validateState(null)).toThrow();
    expect(() => addDays('2026-02-30', 1)).toThrow();
    expect(() => validateState(setup({ dailyIncome: -1 }))).toThrow();
    const state = setup();
    state.needs = [need(), need()];
    expect(() => validateState(state)).toThrow(/duplikat/);
    state.needs = [need({ kind: 'recurring', intervalDays: 0 })];
    expect(() => validateState(state)).toThrow(/interval/);
    expect(() => forecast(state, { asOf: MONDAY })).toThrow(/interval/);
  });

  it('rejects excessive allocations and payments without mutating the state', () => {
    const state = setup();
    state.needs = [need()];
    expect(() => reducer(state, { type: 'need/pay', id: 'debt', date: MONDAY, amount: 400_000 })).toThrow();
    expect(state.transactions).toEqual([]);
    state.needs[0].saved = 400_000;
    expect(() => validateState(state)).toThrow(/alokasi/);
  });

  it('rejects a synced payload with duplicate income for the same attendance day', () => {
    const state = reducer(setup(), { type: 'attendance/record', attendance: { date: MONDAY, status: 'present' } });
    state.transactions.push({ ...state.transactions[0], id: 'duplicate-work-income' });
    expect(() => validateState(state)).toThrow(/absensi ganda/);
  });
});

describe('monthly payroll cycle and activity allowance', () => {
  it('calculates calendar month bounds correctly across month changes and leap years', () => {
    expect(getMonthBounds('2026-09-21')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(getMonthBounds('2028-02-14')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(getPreviousMonthBounds('2026-10-02')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(getPreviousMonthBounds('2027-01-05')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('calculates accrued salary, projected month-end salary and next payday for Egha model', () => {
    // 70.000 / day, Monday-Friday (workDays: [1,2,3,4,5]), allowance: 20.000 / day
    const state = setup({
      dailyIncome: 70_000,
      activityAllowance: 20_000,
      payrollCycle: 'monthly',
      payday: 5,
      workDays: [1, 2, 3, 4, 5],
    });

    // Record past attendance: 2026-09-15 present, 2026-09-16 half day
    state.attendance = [
      { date: '2026-09-15', status: 'present' },
      { date: '2026-09-16', status: 'half' },
    ];

    const payroll = calculatePayroll(state, '2026-09-21');
    expect(payroll.monthStart).toBe('2026-09-01');
    expect(payroll.monthEnd).toBe('2026-09-30');
    expect(payroll.nextPayday).toBe('2026-10-05');
    expect(payroll.daysUntilPayday).toBe(14); // from Sept 21 to Oct 5
    // Accrued through Sept 21 (14.5 workdays with half-day on Sept 16): 14.5 * 70.000 = 1.015.000
    expect(payroll.accruedCurrentMonth).toBe(1_015_000);
    // Total projected includes past accrued + remaining 7 workdays in Sept (490.000) = 1.505.000 (~1.5 jt)
    expect(payroll.projectedMonthEnd).toBe(1_505_000);
    expect(payroll.allowanceReceived).toBe(14.5 * 20_000); // 290.000
  });

  it('keeps previous month salary locked when evaluating in the waiting window (1st to 5th)', () => {
    const state = setup({
      dailyIncome: 70_000,
      payrollCycle: 'monthly',
      payday: 5,
      workDays: [1, 2, 3, 4, 5],
    });

    // On 2026-10-02 (waiting for payday on Oct 5):
    // Next payday is 2026-10-05, daysUntilPayday is 3
    const payroll = calculatePayroll(state, '2026-10-02');
    expect(payroll.nextPayday).toBe('2026-10-05');
    expect(payroll.daysUntilPayday).toBe(3);
    // Locked previous month salary is computed from September workdays (22 days * 70.000 = 1.540.000)
    expect(payroll.lockedPreviousMonthSalary).toBe(1_540_000);
  });

  it('credits cash activity allowance to immediate balance while accumulating base salary', () => {
    let state = setup({
      dailyIncome: 70_000,
      activityAllowance: 20_000,
      payrollCycle: 'monthly',
      payday: 5,
      openingBalance: 50_000,
    });

    // Record attendance today
    state = reducer(state, { type: 'attendance/record', attendance: { date: MONDAY, status: 'present' } });

    // Immediate cash in hand increased by the cash allowance (20.000), not the 70.000 base salary
    expect(balance(state, MONDAY)).toBe(70_000); // 50.000 opening + 20.000 allowance
    const attTx = state.transactions.find((t) => t.date === MONDAY);
    expect(attTx?.amount).toBe(20_000);
    expect(attTx?.category).toBe('Tunjangan');

    // Attendance record retains work income for monthly payroll: 15 workdays elapsed up to Sept 21
    const payroll = calculatePayroll(state, MONDAY);
    expect(payroll.accruedCurrentMonth).toBe(1_050_000);
  });

  it('forecasts monthly payday disbursement on the 5th of next month', () => {
    const state = setup({
      dailyIncome: 70_000,
      activityAllowance: 20_000,
      payrollCycle: 'monthly',
      payday: 5,
      openingBalance: 100_000,
      dailyBudget: 25_000,
    });

    // Forecast from 2026-09-21 for 20 days (covers up to 2026-10-10, including payday Oct 5)
    const result = forecast(state, { asOf: MONDAY, horizonDays: 20 });
    const oct5 = result.days.find((d) => d.date === '2026-10-05');
    expect(oct5).toBeDefined();
    // On Oct 5, income includes the monthly salary disbursement (> 1.400.000)
    expect(oct5!.income).toBeGreaterThan(1_400_000);
  });

  it('does not add a second estimated paycheck when the actual salary is recorded manually', () => {
    const state = setup({
      dailyIncome: 70_000,
      payrollCycle: 'monthly',
      payday: 5,
      workDays: [1, 2, 3, 4, 5],
    });
    state.transactions.push({
      id: 'actual-october-salary',
      title: 'Gaji Oktober',
      amount: 1_500_000,
      date: '2026-10-05',
      category: 'Pemasukan lain',
      type: 'income',
    });

    const result = forecast(state, { asOf: MONDAY, horizonDays: 20 });
    const payday = result.days.find((day) => day.date === '2026-10-05');
    expect(payday?.income).toBe(1_500_000);
  });

  it('recognizes Indonesian national holidays and treats them as off days by default', () => {
    const state = setup({ dailyIncome: 70_000 });
    // 2026-08-17 is Indonesia's Independence Day (Monday)
    expect(getHoliday('2026-08-17')).toBe('Hari Kemerdekaan Republik Indonesia');
    expect(isNationalHoliday('2026-08-17')).toBe(true);
    // Even though Monday is in workDays [1..6], 2026-08-17 is a national holiday, so isWorkday returns false
    expect(isWorkday(state, '2026-08-17')).toBe(false);

    // But if the user worked on holiday (lembur), present attendance overrides it
    const overtimeState = reducer(state, {
      type: 'attendance/record',
      attendance: { date: '2026-08-17', status: 'present', income: 100_000 },
    });
    expect(isWorkday(overtimeState, '2026-08-17')).toBe(true);
  });

  it('uses the complete official 2027 national holiday calendar', () => {
    const state = setup();
    expect(isNationalHoliday('2027-01-05')).toBe(true);
    expect(isNationalHoliday('2027-03-08')).toBe(true);
    expect(isNationalHoliday('2027-03-09')).toBe(false); // collective leave, not a national holiday
    expect(isNationalHoliday('2027-03-11')).toBe(true);
    expect(isNationalHoliday('2027-12-26')).toBe(true);
    expect(isWorkday(state, '2027-03-08')).toBe(false);
    expect(isWorkday(state, '2027-03-09')).toBe(true);
  });
});

describe('automatic attendance', () => {
  const FRIDAY = '2026-09-25';

  it('records unrecorded workdays as present, skipping days off and earlier history', () => {
    let state = setup({ startDate: '2026-09-14', autoAttendanceFrom: MONDAY });
    state = applyAutoAttendance(state, '2026-09-27');
    expect(state.attendance.map((a) => a.date)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', FRIDAY]);
    expect(state.attendance.every((a) => a.status === 'present' && a.auto && !a.planned)).toBe(true);
    expect(balance(state, '2026-09-27')).toBe(500_000);
    expect(applyAutoAttendance(state, '2026-09-27')).toBe(state);
  });

  it('keeps a day marked absent and does not add its income back', () => {
    let state = applyAutoAttendance(setup(), MONDAY);
    expect(balance(state, MONDAY)).toBe(100_000);
    state = reducer(state, { type: 'attendance/record', attendance: { date: MONDAY, status: 'absent' } });
    expect(state.attendance[0].auto).toBeUndefined();
    state = applyAutoAttendance(state, MONDAY);
    expect(balance(state, MONDAY)).toBe(0);
    expect(state.attendance).toHaveLength(1);
  });

  it('starts from today for records created before automatic attendance existed', () => {
    const { autoAttendanceFrom: _unused, ...profile } = setup({ startDate: '2026-09-01' }).profile;
    const state = applyAutoAttendance({ ...setup(), profile }, MONDAY);
    expect(state.profile.autoAttendanceFrom).toBe(MONDAY);
    expect(state.attendance.map((a) => a.date)).toEqual([MONDAY]);
  });

  it('confirms an advance plan once its day arrives', () => {
    const tuesday = '2026-09-22';
    let state = reducer(setup(), { type: 'attendance/record', attendance: { date: tuesday, status: 'half' } });
    vi.setSystemTime(new Date(`${tuesday}T05:00:00Z`));
    state = applyAutoAttendance(state, tuesday);
    expect(state.attendance.find((a) => a.date === tuesday)).toMatchObject({ status: 'half', planned: false });
    expect(balance(state, tuesday)).toBe(150_000);
  });
});

describe('not working', () => {
  it('expects no work income or salary and skips automatic attendance', () => {
    const state = setup({ working: false, payrollCycle: 'monthly', payday: 25, activityAllowance: 20_000, openingBalance: 100_000 });
    expect(isWorkday(state, MONDAY)).toBe(false);
    expect(applyAutoAttendance(state, MONDAY)).toBe(state);
    expect(forecast(state, { asOf: MONDAY, horizonDays: 30 }).expectedIncome).toBe(0);
  });

  it('still counts income recorded by hand', () => {
    const state = reducer(setup({ working: false }), { type: 'transaction/add', transaction: { id: 'kiriman', title: 'Transfer', amount: 500_000, type: 'income', category: 'Kiriman', date: MONDAY } });
    expect(balance(state, MONDAY)).toBe(500_000);
  });

  it('does not backfill the non-working period when work resumes', () => {
    let state = setup({ working: false, autoAttendanceFrom: '2026-09-01' });
    state = reducer(state, { type: 'profile/update', profile: { working: true } });
    expect(state.profile.autoAttendanceFrom).toBe(MONDAY);
    expect(applyAutoAttendance(state, MONDAY).attendance.map((a) => a.date)).toEqual([MONDAY]);
  });
});

describe('budget periods', () => {
  it('starts each period on the chosen day of the month', () => {
    expect(periodBounds('2026-09-26', 26)).toEqual({ start: '2026-09-26', end: '2026-10-25' });
    expect(periodBounds('2026-09-25', 26)).toEqual({ start: '2026-08-26', end: '2026-09-25' });
    expect(periodBounds('2026-01-10', 26)).toEqual({ start: '2025-12-26', end: '2026-01-25' });
    expect(periodBounds('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('daily items and leftovers', () => {
  const SATURDAY = '2026-09-26';
  const items = [
    { id: 'a', title: 'Ongkos Anak A', amount: 50_000, days: [1, 2, 3, 4, 5], skipHolidays: true },
    { id: 'b', title: 'Ongkos Anak B', amount: 30_000, days: [1, 2, 3, 4, 5, 6], skipHolidays: true },
    { id: 'masak', title: 'Masak', amount: 70_000, days: [0, 1, 2, 3, 4, 5, 6], skipHolidays: false },
  ];
  function family(): AppState {
    vi.setSystemTime(new Date(`${SATURDAY}T05:00:00Z`));
    const state = setup({ working: false, openingBalance: 5_000_000, startDate: '2026-09-01', periodStartDay: 26 });
    return applyAutoDaily(reducer(state, { type: 'daily/set', items }), SATURDAY);
  }

  it('records the day\'s items automatically and plans the whole period', () => {
    const state = family();
    expect(state.transactions.map((t) => t.id).sort()).toEqual(['daily:b:2026-09-26', 'daily:masak:2026-09-26']);
    expect(balance(state, SATURDAY)).toBe(4_900_000);
    const budget = periodBudget(state, SATURDAY);
    expect(budget.dailyPlans.map((plan) => [plan.item.id, plan.days, plan.total])).toEqual([
      ['a', 20, 1_000_000], ['b', 25, 750_000], ['masak', 30, 2_100_000],
    ]);
    expect(budget.dailyRemaining).toBe(3_750_000);
    expect(budget.freeMoney).toBe(1_150_000);
    expect(budget.perDay).toBe(38_333);
    expect(applyAutoDaily(state, SATURDAY)).toBe(state);
  });

  it('moves unused money into the pot without changing the free money', () => {
    let state = reducer(family(), { type: 'daily/leftover', itemId: 'masak', date: SATURDAY, amount: 20_000 });
    expect(state.transactions.find((t) => t.id === 'daily:masak:2026-09-26')?.amount).toBe(50_000);
    let budget = periodBudget(state, SATURDAY);
    expect(budget.leftoverPot).toBe(20_000);
    expect(budget.freeMoney).toBe(1_150_000);
    // Marked ahead: Anak A stays home on Monday. Nothing changes until that day arrives.
    state = reducer(state, { type: 'daily/leftover', itemId: 'a', date: '2026-09-28', amount: 50_000 });
    expect(periodBudget(state, SATURDAY).freeMoney).toBe(1_150_000);
    vi.setSystemTime(new Date('2026-09-28T05:00:00Z'));
    state = applyAutoDaily(state, '2026-09-28');
    expect(state.transactions.some((t) => t.id === 'daily:a:2026-09-28')).toBe(false);
    budget = periodBudget(state, '2026-09-28');
    expect(budget.leftoverPot).toBe(70_000);
    expect(budget.dailyPlans[0].today).toEqual({ scheduled: true, recorded: 0, leftover: 50_000 });
  });

  it('takes spending from the pot and lowers the allowance when overspending', () => {
    let state = reducer(family(), { type: 'daily/leftover', itemId: 'b', date: SATURDAY, amount: 30_000 });
    const budget = periodBudget(state, SATURDAY);
    expect(budget.leftoverPot).toBe(30_000);
    expect(checkPurchase(budget, 20_000)).toMatchObject({ verdict: 'jatah', fromAllowance: 20_000, fromLeftover: 0 });
    expect(checkPurchase(budget, 60_000)).toMatchObject({ verdict: 'sisa', fromAllowance: 38_333, fromLeftover: 21_667 });
    const big = checkPurchase(budget, 500_000);
    expect(big.verdict).toBe('turun');
    expect(big.perDayAfter).toBe(Math.floor((1_150_000 - 470_000) / 29));
    expect(checkPurchase(budget, 2_000_000)).toMatchObject({ verdict: 'bahaya', shortfall: 820_000 });

    state = reducer(state, { type: 'transaction/add', transaction: { id: 'jajan', title: 'Bakso', amount: 60_000, type: 'expense', category: 'Jajan', date: SATURDAY, fromLeftover: 21_667 } });
    const after = periodBudget(state, SATURDAY);
    expect(after.leftoverPot).toBe(8_333);
    expect(after.spentToday).toBe(38_333);
    expect(after.leftToday).toBe(0);
  });

  it('warns when the period cannot cover its obligations', () => {
    const state = reducer(family(), { type: 'transaction/add', transaction: { id: 'besar', title: 'Servis', amount: 1_300_000, type: 'expense', category: 'Darurat', date: SATURDAY } });
    const budget = periodBudget(state, SATURDAY);
    expect(budget.shortfall).toBe(150_000);
    expect(budget.perDay).toBe(0);
  });

  it('marks a school holiday range as unused and ignores days off', () => {
    const state = reducer(family(), { type: 'daily/skipRange', itemId: 'a', from: '2026-10-05', to: '2026-10-11' });
    expect(state.leftovers!.map((l) => l.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(periodBudget(state, SATURDAY).dailyPlans[0]).toMatchObject({ days: 15, total: 750_000 });
  });

  it('does not backfill earlier days when a schedule changes', () => {
    let state = family();
    vi.setSystemTime(new Date('2026-10-03T05:00:00Z'));
    state = reducer(state, { type: 'daily/set', items: items.map((item) => item.id === 'a' ? { ...item, days: [1, 2, 3, 4, 5, 6] } : item) });
    state = applyAutoDaily(state, '2026-10-03');
    expect(state.dailyItems![0].since).toBe('2026-10-03');
    expect(state.transactions.filter((t) => t.dailyItemId === 'a').map((t) => t.date)).toEqual(['2026-10-03']);
  });

  it('keeps income for the next period out of the current one', () => {
    vi.setSystemTime(new Date('2026-09-25T05:00:00Z'));
    let state = setup({ working: false, openingBalance: 300_000, startDate: '2026-09-01', periodStartDay: 26 });
    state = reducer(state, { type: 'transaction/add', transaction: { id: 'ayah', title: 'Transfer ayah', amount: 5_000_000, type: 'income', category: 'Kiriman', date: '2026-09-25', effectiveDate: '2026-09-26' } });
    const lastDay = periodBudget(state, '2026-09-25');
    expect(lastDay.money).toBe(300_000);
    expect(lastDay.heldForNextPeriod).toBe(5_000_000);
    expect(lastDay.perDay).toBe(300_000);
    const firstDay = periodBudget(state, '2026-09-26');
    expect(firstDay.money).toBe(5_300_000);
    expect(firstDay.carryOver).toBe(300_000);
    expect(firstDay.periodIncome).toBe(5_000_000);
  });

  it('keeps each period\'s leftovers separate in the history', () => {
    let state = reducer(family(), { type: 'daily/leftover', itemId: 'masak', date: SATURDAY, amount: 10_000 });
    vi.setSystemTime(new Date('2026-10-27T05:00:00Z'));
    state = applyAutoDaily(state, '2026-10-27');
    state = reducer(state, { type: 'daily/leftover', itemId: 'b', date: '2026-10-27', amount: 30_000 });
    const [previous] = periodHistory(state, '2026-10-27');
    expect(previous).toMatchObject({ start: '2026-09-26', end: '2026-10-25', leftover: 10_000 });
    expect(periodBudget(state, '2026-10-27').leftoverPot).toBe(30_000);
  });

  it('turns the old daily budget into an automatic item', () => {
    const { dailyItems: _unused, ...legacy } = setup({ dailyBudget: 30_000 });
    const migrated = migrateDailyBudget(legacy, MONDAY);
    expect(migrated.profile.dailyBudget).toBe(0);
    expect(migrated.dailyItems).toEqual([{ id: 'harian-rutin', title: 'Harian rutin', amount: 30_000, days: [0, 1, 2, 3, 4, 5, 6], skipHolidays: false, since: MONDAY }]);
    expect(applyAutomations(legacy, MONDAY).transactions.some((t) => t.id === 'daily:harian-rutin:2026-09-21')).toBe(true);
  });

  it('includes future daily items in the cash forecast', () => {
    const state = family();
    const result = forecast(state, { asOf: SATURDAY, horizonDays: 3 });
    expect(result.days.map((day) => day.expenses)).toEqual([0, 70_000, 150_000]);
  });
});

describe('monthly shopping list', () => {
  const list = [
    { id: 'beras', name: 'Beras 10 kg', qty: 1, price: 145_000, image: 'data:image/jpeg;base64,AAAA' },
    { id: 'minyak', name: 'Minyak 2 L', qty: 2, price: 38_000 },
    { id: 'sabun', name: 'Sabun cuci', qty: 1, price: 25_000, skip: true },
  ];

  it('keeps one need for the list total on the chosen day', () => {
    vi.setSystemTime(new Date('2026-09-27T05:00:00Z'));
    const state = reducer(setup({ periodStartDay: 26, openingBalance: 1_000_000 }), { type: 'shopping/set', items: list, dueDay: 28 });
    expect(shoppingTotal(state.shopping)).toBe(221_000);
    expect(state.needs).toMatchObject([{ title: 'Belanja bulanan', amount: 221_000, dueDate: '2026-09-28' }]);
    const updated = reducer(state, { type: 'shopping/set', items: list.map((item) => ({ ...item, skip: false })), dueDay: 28 });
    expect(updated.needs).toHaveLength(1);
    expect(updated.needs[0].amount).toBe(246_000);
  });

  it('records the real total, keeps new prices and moves the difference into the pot', () => {
    vi.setSystemTime(new Date('2026-09-28T05:00:00Z'));
    let state = reducer(setup({ periodStartDay: 26, openingBalance: 1_000_000 }), { type: 'shopping/set', items: list, dueDay: 28 });
    state = reducer(state, { type: 'shopping/finish', id: 'belanja-1', date: '2026-09-28', items: [
      { id: 'beras', qty: 1, price: 140_000, bought: true },
      { id: 'minyak', qty: 2, price: 36_000, bought: true },
      { id: 'sabun', qty: 1, price: 25_000, bought: false },
    ] });
    expect(balance(state, '2026-09-28')).toBe(788_000);
    expect(state.leftovers).toMatchObject([{ amount: 9_000, title: 'Sisa belanja bulanan' }]);
    expect(state.shopping!.items.map((item) => [item.price, item.skip])).toEqual([[140_000, undefined], [36_000, undefined], [25_000, undefined]]);
    expect(state.shopping!.items[0].image).toBe('data:image/jpeg;base64,AAAA');
    const open = state.needs.filter((need) => !need.paid);
    expect(open).toMatchObject([{ amount: 237_000, dueDate: '2026-10-28' }]);
    expect(periodBudget(state, '2026-09-28').obligations).toBe(0);
  });
});

describe('electricity tokens', () => {
  function tokens(): AppState {
    vi.setSystemTime(new Date('2026-09-20T05:00:00Z'));
    let state = setup({ openingBalance: 1_000_000 });
    state = reducer(state, { type: 'electricity/purchase', purchase: { id: 't1', date: '2026-09-01', amount: 200_000, kwh: 140 } });
    return reducer(state, { type: 'electricity/purchase', purchase: { id: 't2', date: '2026-09-13', amount: 200_000, kwh: 140 } });
  }

  it('learns how long a purchase lasts and plans the next one', () => {
    const state = tokens();
    const estimate = electricityEstimate(state, '2026-09-20');
    expect(estimate).toMatchObject({ costPerDay: 16_667, daysPerPurchase: 12, nextPurchaseDate: '2026-09-25', monthlyCost: 500_000 });
    expect(state.needs.filter((need) => !need.paid)).toMatchObject([{ title: 'Token listrik', amount: 200_000, dueDate: '2026-09-25', intervalDays: 12 }]);
    expect(balance(state, '2026-09-20')).toBe(600_000);
  });

  it('shows how much to save to stay within the monthly budget', () => {
    const state = reducer(tokens(), { type: 'electricity/settings', monthlyBudget: 400_000 });
    const target = electricityEstimate(state, '2026-09-20').target!;
    expect(target.overBudget).toBe(100_000);
    expect(target.kwhPerDay).toBeCloseTo(9.33, 2);
    expect(target.saveKwhPerDay).toBeCloseTo(2.33, 2);
  });

  it('uses meter readings for the remaining days', () => {
    let state = reducer(tokens(), { type: 'electricity/reading', reading: { date: '2026-09-16', kwh: 60 } });
    state = reducer(state, { type: 'electricity/reading', reading: { date: '2026-09-20', kwh: 16 } });
    const estimate = electricityEstimate(state, '2026-09-20');
    expect(estimate.kwhPerDay).toBe(11);
    expect(estimate.daysLeft).toBeCloseTo(16 / 11, 5);
    expect(estimate.nextPurchaseDate).toBe('2026-09-21');
  });

  it('rejects malformed budget data', () => {
    expect(() => validateState({ ...setup(), dailyItems: [{ id: 'x', title: 'X', amount: 0, days: [1], skipHolidays: true, since: MONDAY }] })).toThrow();
    expect(() => validateState({ ...setup(), shopping: { dueDay: 1, items: [{ id: 'x', name: 'X', qty: 1, price: 1, image: 'javascript:alert(1)' }] } })).toThrow();
    expect(() => validateState({ ...setup(), shopping: { dueDay: 1, items: [{ id: 'x', name: 'X', qty: 1, price: 1, image: `data:image/jpeg;base64,${'A'.repeat(90_000)}` }] } })).toThrow();
    expect(() => validateState({ ...setup(), electricity: { purchases: [{ id: 'p', date: MONDAY, amount: 100, kwh: -1 }], readings: [] } })).toThrow();
  });
});

describe('allowance follows when money actually arrives', () => {
  function monthlyWorker(overrides: Partial<AppState['profile']> = {}): AppState {
    const today = '2026-09-26';
    vi.setSystemTime(new Date(`${today}T05:00:00Z`));
    const state = defaultState(today);
    state.profile = { ...state.profile, name: 'Egha', working: true, dailyIncome: 70_000, activityAllowance: 50_000, payrollCycle: 'monthly', payday: 5, periodStartDay: 6, workDays: [1, 2, 3, 4, 5], openingBalance: 0, ...overrides };
    return applyAutomations(state, today);
  }

  it('does not let a salary that has not arrived be spent (reported: saldo Rp0, jatah Rp184.000)', () => {
    const budget = periodBudget(monthlyWorker(), '2026-09-26');
    expect(budget.money).toBe(0);
    expect(budget.perDay).toBe(0);
    expect(budget.safeNow).toBe(0);
    expect(budget.nextIncome).toEqual({ date: '2026-09-28', amount: 50_000 });
    // Paid on the last day of the 6th–5th period, the salary is next period's money.
    expect(budget.nextPeriodIncome).toEqual({ date: '2026-10-05', amount: 1_540_000 });
  });

  it('spreads cash in hand over the days until more money arrives', () => {
    const budget = periodBudget(monthlyWorker({ workDays: [1, 2, 3, 4, 5, 6] }), '2026-09-26');
    expect(budget.money).toBe(50_000);
    expect(budget.perDay).toBe(25_000); // Saturday's pocket money must also cover Sunday.
    expect(budget.cashLimitedUntil).toBe('2026-09-28');
  });

  it('spreads the salary over the period when the period starts on payday', () => {
    vi.setSystemTime(new Date('2026-10-05T05:00:00Z'));
    let state = monthlyWorker({ periodStartDay: 5 });
    state = applyAutomations(state, '2026-10-05');
    const budget = periodBudget(state, '2026-10-05');
    expect(budget.nextPeriodIncome).toBeUndefined();
    expect(budget.perDay).toBeGreaterThan(0);
    expect(budget.perDay * budget.daysLeft).toBeLessThanOrEqual(budget.money + budget.expectedIncome);
  });

  it('flags a bill that is due before the salary arrives', () => {
    vi.setSystemTime(new Date('2026-09-10T05:00:00Z'));
    let state = setup({ openingBalance: 100_000, dailyIncome: 0, periodStartDay: 25, payrollCycle: 'monthly', payday: 25, working: true });
    state.needs = [need({ id: 'cicilan', amount: 300_000, dueDate: '2026-09-20' })];
    const budget = periodBudget(state, '2026-09-10');
    expect(budget.shortfall).toBe(200_000);
    expect(budget.shortfallDate).toBe('2026-09-20');
    expect(budget.perDay).toBe(0);
  });

  it('keeps money for bills due after the period but before the next income', () => {
    vi.setSystemTime(new Date('2026-09-26T05:00:00Z'));
    // Daily worker, Mon–Fri. The period ends on Friday 2 Oct; the next pay is Monday 5 Oct.
    const state = setup({ openingBalance: 500_000, dailyIncome: 0, periodStartDay: 3, working: false });
    state.needs = [need({ id: 'sewa', amount: 200_000, dueDate: '2026-10-04' })];
    const withGap = periodBudget({ ...state, profile: { ...state.profile, working: true, dailyIncome: 100_000 } }, '2026-09-26');
    expect(withGap.end).toBe('2026-10-02');
    expect(withGap.reservedAfterPeriod).toBe(200_000);
    expect(withGap.timeline.at(-1)!.date).toBe('2026-10-04');
  });

  it('refuses a purchase that only later income could pay for', () => {
    const state = monthlyWorker({ workDays: [1, 2, 3, 4, 5, 6] });
    const budget = periodBudget(state, '2026-09-26');
    expect(checkPurchase(budget, 50_000).verdict).toBe('turun');
    expect(checkPurchase(budget, 60_000)).toMatchObject({ verdict: 'bahaya', shortfall: 10_000 });
    expect(checkPurchase(periodBudget(monthlyWorker(), '2026-09-26'), 20_000)).toMatchObject({ verdict: 'bahaya', cashShort: 20_000, cashNow: 0 });
  });

  it('does not backfill attendance when the work days change', () => {
    vi.setSystemTime(new Date('2026-09-26T05:00:00Z'));
    let state = applyAutomations(setup({ startDate: '2026-09-01', autoAttendanceFrom: '2026-09-01', workDays: [1, 2, 3, 4, 5] }), '2026-09-26');
    const before = state.attendance.length;
    state = reducer(state, { type: 'profile/update', profile: { workDays: [1, 2, 3, 4, 5, 6] } }, '2026-09-26');
    state = applyAutomations(state, '2026-09-26');
    // Only today (a Saturday) is added, not the Saturdays earlier in September.
    expect(state.attendance.length).toBe(before + 1);
  });
});

describe('date arithmetic', () => {
  it('matches the calendar across centuries and rejects impossible dates', () => {
    let date = '1899-12-25';
    let reference = new Date('1899-12-25T12:00:00Z');
    for (let i = 0; i < 9000; i++) {
      const step = (i % 37) + 1;
      date = addDays(date, step);
      reference = new Date(reference.getTime() + step * 86_400_000);
      expect(date).toBe(reference.toISOString().slice(0, 10));
    }
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2100-03-01', -1)).toBe('2100-02-28');
    expect(daysBetween('2026-01-31', '2026-03-01')).toBe(29);
    for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '26-01-01', '2026-1-01', '2026-01-01T00']) expect(isDateKey(bad)).toBe(false);
    expect(isDateKey('2028-02-29')).toBe(true);
  });
});

describe('simulated months (property test)', () => {
  function random(seed: number) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('following the allowance never overdraws and never breaks a covered period', { timeout: 120_000 }, () => {
    let checkedDays = 0;
    let coveredPeriods = 0;
    let coveredDaysChecked = 0;
    let daysWithAllowance = 0;
    let spent = 0;
    const modes = new Set<string>();
    for (let seed = 1; seed <= 48; seed++) {
      const rnd = random(seed);
      const pick = <T,>(items: readonly T[]) => items[Math.floor(rnd() * items.length)];
      const start = addDays('2026-01-05', Math.floor(rnd() * 300));
      const mode = pick(['daily', 'monthly', 'none'] as const);
      const payday = pick([1, 5, 10, 25, 28]);
      const periodStartDay = mode === 'monthly' ? pick([payday, payday, 1, 15]) : pick([1, 5, 15, 25, 26, 28]);
      vi.setSystemTime(new Date(`${start}T05:00:00Z`));
      let state = defaultState(start);
      state.profile = {
        ...state.profile, name: `Sim ${seed}`, working: mode !== 'none', dailyIncome: mode === 'none' ? 0 : pick([80_000, 120_000]),
        activityAllowance: mode === 'none' ? 0 : pick([0, 20_000]), payrollCycle: mode === 'monthly' ? 'monthly' : 'daily', payday,
        periodStartDay, openingBalance: pick([0, 300_000, 1_500_000, 4_000_000]), workDays: pick([[1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6]]),
      };
      state.dailyItems = Array.from({ length: Math.floor(rnd() * 3) }, (_, i) => ({
        id: `d${i}`, title: `Harian ${i}`, amount: pick([10_000, 25_000, 50_000]), days: pick([[1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]]), skipHolidays: rnd() < 0.5, since: start,
      }));
      state.needs = Array.from({ length: Math.floor(rnd() * 3) }, (_, i) => need({
        id: `n${i}`, title: `Tagihan ${i}`, amount: pick([100_000, 250_000, 600_000]), dueDate: addDays(start, Math.floor(rnd() * 60)),
        kind: rnd() < 0.5 ? 'recurring' : 'debt', intervalDays: 30,
      }));
      state = validateState(state);
      let periodStart = '';
      let periodCovered = false;
      for (let day = 0; day < 75; day++) {
        const today = addDays(start, day);
        vi.setSystemTime(new Date(`${today}T05:00:00Z`));
        state = applyAutomations(state, today);
        const period = periodBounds(today, state.profile.periodStartDay);
        // Monthly money arrives as predicted; near a period end it is kept for the next period.
        if (mode === 'monthly') {
          const salary = forecast(state, { asOf: today, horizonDays: 1 }).days[0].salary;
          if (salary > 0) state = reducer(state, { type: 'transaction/add', transaction: { id: `gaji-${today}`, title: 'Gaji', amount: salary, type: 'income', category: 'Gaji', date: today, ...(daysBetween(today, period.end) < 3 ? { effectiveDate: addDays(period.end, 1) } : {}) } }, today);
        }
        if (mode === 'none' && Number(today.slice(8, 10)) === state.profile.periodStartDay) {
          state = reducer(state, { type: 'transaction/add', transaction: { id: `kiriman-${today}`, title: 'Kiriman', amount: 3_000_000, type: 'income', category: 'Kiriman', date: today } }, today);
        }
        const budget = periodBudget(state, today);
        if (budget.start !== periodStart) {
          periodStart = budget.start;
          periodCovered = budget.shortfall === 0;
          if (periodCovered) coveredPeriods++;
        } else if (periodCovered) {
          // Everything in this period was known at its start; following the plan must keep it covered.
          expect({ seed, today, shortfall: budget.shortfall }).toEqual({ seed, today, shortfall: 0 });
          coveredDaysChecked++;
        }
        modes.add(mode);
        expect(budget.perDay).toBeGreaterThanOrEqual(0);
        expect(budget.perDay).toBeLessThanOrEqual(Math.max(0, budget.safeNow));
        // Pay what is due, then spend exactly today's allowance.
        for (const due of state.needs.filter((entry) => !entry.paid && entry.dueDate <= today)) {
          if (balance(state, today) >= remainingAmount(due)) state = reducer(state, { type: 'need/pay', id: due.id, date: today }, today);
        }
        if (budget.perDay > 0) {daysWithAllowance++; spent += budget.perDay;}
        if (budget.perDay > 0) state = reducer(state, { type: 'transaction/add', transaction: { id: `jajan-${today}`, title: 'Jajan', amount: budget.perDay, type: 'expense', category: 'Jajan', date: today } }, today);
        if (budget.shortfall === 0) expect({ seed, today, balance: balance(state, today) >= 0 }).toEqual({ seed, today, balance: true });
        checkedDays++;
      }
    }
    console.log(JSON.stringify({ checkedDays, coveredPeriods, coveredDaysChecked, daysWithAllowance, spent, modes: [...modes] }));
    expect(checkedDays).toBe(48 * 75);
    expect(coveredPeriods).toBeGreaterThan(40);
    expect(coveredDaysChecked).toBeGreaterThan(1500);
    expect(daysWithAllowance).toBeGreaterThan(1000);
    expect(modes.size).toBe(3);
  });
});
