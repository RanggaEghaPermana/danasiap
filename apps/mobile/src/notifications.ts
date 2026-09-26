import * as Notifications from 'expo-notifications';
import { AppState, addDays, forecast } from '@danasiap/core';

Notifications.setNotificationHandler({handleNotification: async () => ({shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false})});

export async function enableReminders() {
  await Notifications.setNotificationChannelAsync('plans', {name: 'Kebutuhan & jadwal kerja', importance: Notifications.AndroidImportance.DEFAULT, lightColor: '#C8ED69'});
  const permission = await Notifications.requestPermissionsAsync();
  return permission.granted;
}

export async function scheduleReminders(state: AppState, enabled: boolean) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!enabled) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const now = new Date();
  const projection = forecast(state, {horizonDays: 30});
  for (const need of state.needs.filter(n => !n.paid).slice(0, 20)) {
    const reminder = new Date(`${addDays(need.dueDate, -2)}T08:00:00+07:00`);
    const trigger = reminder > now ? reminder : new Date(`${need.dueDate}T08:00:00+07:00`);
    if (trigger <= now) continue;
    const risk = projection.risks.find(r => r.needId === need.id);
    await Notifications.scheduleNotificationAsync({
      content: {title: 'Kebutuhanmu sebentar lagi', body: `${need.title} mendekati jadwal. ${risk ? 'Ada potensi kekurangan dana. ' : ''}Buka DanaSiap untuk lihat rencana.`, data: {screen: 'needs', needId: need.id}},
      trigger: {type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger, channelId: 'plans'},
    });
  }
}
