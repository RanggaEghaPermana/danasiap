import * as Notifications from 'expo-notifications';
import { AppState, addDays, currency, forecast, isScheduled, localDate, periodBounds, periodBudget } from '@danasiap/core';

Notifications.setNotificationHandler({handleNotification: async () => ({shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false})});

export async function enableReminders() {
  await Notifications.setNotificationChannelAsync('plans', {name: 'Kebutuhan, jatah & pengingat harian', importance: Notifications.AndroidImportance.DEFAULT, lightColor: '#C8ED69'});
  const permission = await Notifications.requestPermissionsAsync();
  return permission.granted;
}

/** Days ahead that get a morning allowance and an evening check; refreshed whenever the app opens. */
const DAYS_AHEAD = 3;
const shortDate = (date: string) => new Date(`${date}T12:00:00+07:00`).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta'});
const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
// Warn once per distinct shortfall while the app runs, not on every save.
let lastShortfallAlert = '';

async function schedule(when: Date, title: string, body: string, data: Record<string, unknown>) {
  if (when <= new Date()) return;
  await Notifications.scheduleNotificationAsync({
    content: {title, body, data},
    trigger: {type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: 'plans'},
  });
}

export async function scheduleReminders(state: AppState, enabled: boolean) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!enabled) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const today = localDate();
  const projection = forecast(state, {horizonDays: 30});

  // 1. Needs: two days ahead at 08:00 (or on the day), including shopping, tokens and gas.
  for (const need of state.needs.filter(n => !n.paid).slice(0, 20)) {
    const reminder = at(addDays(need.dueDate, -2), '08:00');
    const trigger = reminder > new Date() ? reminder : at(need.dueDate, '08:00');
    const risk = projection.risks.find(r => r.needId === need.id);
    await schedule(trigger, 'Kebutuhanmu sebentar lagi', `${need.title} mendekati jadwal. ${risk ? 'Ada potensi kekurangan dana. ' : ''}Buka DanaSiap untuk lihat rencana.`, {screen: 'needs', needId: need.id});
  }

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = addDays(today, i);
    const budget = periodBudget(state, date);
    // 2. Morning allowance, or the obligation warning while money for obligations is short.
    if (budget.shortfall > 0) {
      await schedule(at(date, '07:00'), 'Uang kurang untuk tagihan & kebutuhan', `Kurang ${currency(budget.shortfall)}${budget.shortfallDate ? ` mulai ${shortDate(budget.shortfallDate)}` : ''}. Cek rencana supaya tagihan & kebutuhan tetap terbayar.`, {screen: 'home'});
    } else if (budget.perDay > 0) {
      await schedule(at(date, '07:00'), 'Jatah hari ini', `Bisa dipakai jajan hari ini ± ${currency(budget.perDay)}. Tagihan & kebutuhan sudah aman.`, {screen: 'home'});
    } else {
      const next = budget.nextIncome ?? budget.nextPeriodIncome;
      await schedule(at(date, '07:00'), 'Jatah hari ini', `Belum ada uang untuk jajan hari ini.${next ? ` Uang berikutnya ± ${currency(next.amount)} masuk ${shortDate(next.date)}.` : ''}`, {screen: 'home'});
    }
    // 3. Evening: did any daily item go unused today?
    const items = (state.dailyItems ?? []).filter(item => isScheduled(item, date) && date >= item.since);
    if (items.length) {
      const names = items.slice(0, 2).map(item => item.title).join(' atau ');
      await schedule(at(date, '18:00'), 'Ada yang nggak kepakai?', `${names}${items.length > 2 ? ', dll.' : ''} hari ini ada yang nggak kepakai? Tandai supaya masuk Uang Sisa.`, {screen: 'home'});
    }
  }

  // 4. Start of the next period: record the monthly money so the allowance is counted.
  const {end} = periodBounds(today, state.profile.periodStartDay);
  await schedule(at(addDays(end, 1), '08:00'), 'Bulan baru dimulai', 'Uang bulanan sudah masuk? Catat di Uang masuk supaya jatah jajan bulan ini dihitung.', {screen: 'home'});

  // 5. Obligations at risk right now: tell once, as soon as it is detected.
  const now = periodBudget(state, today);
  if (now.shortfall > 0) {
    const key = `${now.shortfallDate}:${Math.round(now.shortfall / 1000)}`;
    if (key !== lastShortfallAlert) {
      lastShortfallAlert = key;
      await Notifications.scheduleNotificationAsync({
        content: {title: 'Uang kurang untuk tagihan & kebutuhan', body: `Kurang ${currency(now.shortfall)}${now.shortfallDate ? ` mulai ${shortDate(now.shortfallDate)}` : ''}. Cek rencana supaya tagihan & kebutuhan tetap terbayar.`, data: {screen: 'home'}},
        trigger: {type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: 'plans'},
      });
    }
  } else {
    lastShortfallAlert = '';
  }
}
