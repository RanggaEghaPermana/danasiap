import { expect, it, vi } from 'vitest';
import { addDays, applyAutomations, calculatePayroll, defaultState, forecast, periodBudget, reducer, validateState, type AppState } from '../src/index';

/** About two years of realistic use: daily items, manual spending, attendance, needs, leftovers. */
export function bigState(today: string): AppState {
  const start = addDays(today, -730);
  let state = defaultState(start);
  state.profile = { ...state.profile, name: 'Bench', working: true, dailyIncome: 120_000, activityAllowance: 30_000, payrollCycle: 'daily', periodStartDay: 25, openingBalance: 2_000_000, startDate: start, autoAttendanceFrom: start };
  state.dailyItems = [
    { id: 'a', title: 'Ongkos A', amount: 50_000, days: [1, 2, 3, 4, 5], skipHolidays: true, since: start },
    { id: 'b', title: 'Ongkos B', amount: 30_000, days: [1, 2, 3, 4, 5, 6], skipHolidays: true, since: start },
    { id: 'm', title: 'Masak', amount: 70_000, days: [0, 1, 2, 3, 4, 5, 6], skipHolidays: false, since: start },
  ];
  state.leftovers = [];
  for (let i = 0; i < 730; i++) {
    const date = addDays(start, i);
    if (i % 3 === 0) state.transactions.push({ id: `jajan-${i}`, title: 'Jajan', amount: 15_000, type: 'expense', category: 'Jajan', date });
    if (i % 5 === 0) state.transactions.push({ id: `bensin-${i}`, title: 'Bensin', amount: 25_000, type: 'expense', category: 'Transportasi', date });
    if (i % 4 === 0) state.leftovers.push({ id: `sisa:m:${date}`, date, amount: 10_000, title: 'Sisa Masak', itemId: 'm' });
  }
  state.needs = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, title: `Tagihan ${i}`, amount: 100_000 + i * 10_000, saved: 0, dueDate: addDays(today, i * 3), kind: 'recurring' as const, intervalDays: 30, priority: 'essential' as const }));
  return state;
}

it('stays fast on two years of data (guards against slow loops)', { timeout: 120_000 }, () => {
  const today = '2026-09-26';
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${today}T05:00:00Z`));
  const time = (fn: () => unknown, runs = 20) => {
    fn();
    const started = performance.now();
    for (let i = 0; i < runs; i++) fn();
    return (performance.now() - started) / runs;
  };
  let state!: AppState;
  const firstFill = time(() => { state = applyAutomations(bigState(today), today); }, 3);
  const timings = {
    firstFill,
    automationsIdle: time(() => applyAutomations(state, today)),
    validate: time(() => validateState(state)),
    forecast90: time(() => forecast(state, { asOf: today, horizonDays: 90 })),
    periodBudget: time(() => periodBudget(state, today)),
    payroll: time(() => calculatePayroll(state, today)),
    reducerAdd: time(() => reducer(state, { type: 'transaction/add', transaction: { id: `x${Math.random()}`, title: 'X', amount: 1000, type: 'expense', category: 'Jajan', date: today } })),
  };
  console.log(JSON.stringify(Object.fromEntries(Object.entries(timings).map(([key, ms]) => [key, `${ms.toFixed(2)} ms`]))));
  expect(state.transactions.length).toBeGreaterThan(2500);
  // Generous ceilings (roughly 10x today's numbers) that the old quadratic code broke by far.
  expect(timings.firstFill).toBeLessThan(150);
  expect(timings.automationsIdle).toBeLessThan(12);
  expect(timings.forecast90).toBeLessThan(8);
  expect(timings.periodBudget).toBeLessThan(10);
  expect(timings.reducerAdd).toBeLessThan(15);
  vi.useRealTimers();
});
