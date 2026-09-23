import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays, balance, calculatePayroll, defaultState, demoState, forecast, getHoliday, getMonthBounds,
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
