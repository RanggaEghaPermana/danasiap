import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { addDays, currency, forecast, validateState, type AppState } from '../../../packages/core/src/index.ts';
import { constantTimeEqual, environment, json, localClock } from '../_shared/http.ts';

type Device = { token: string; user_id: string; timezone: string; reminder_hour: number; include_amounts: boolean };
type ExpoTicket = { status: 'ok' | 'error'; id?: string; details?: { error?: string } };
const expoEndpoint = 'https://exp.host/--/api/v2/push';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('REMINDER_JOB_SECRET');
  if (!secret || secret.length < 32) return json({ error: 'Reminder job is not configured' }, 503);
  if (!await constantTimeEqual(request.headers.get('X-Job-Secret') ?? '', secret)) return json({ error: 'Unauthorized' }, 401);

  const now = new Date();
  const client = createClient(environment('SUPABASE_URL'), environment('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const expoHeaders: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoAccessToken) expoHeaders.Authorization = `Bearer ${expoAccessToken}`;
  let accepted = 0;
  let failed = 0;
  let checked = 0;

  try {
    // Receipt success means FCM accepted the message, not that the device displayed it.
    const { data: pending, error: pendingError } = await client.from('reminder_deliveries')
      .select('id,user_id,token,ticket_id').eq('status', 'accepted')
      .lte('created_at', new Date(now.getTime() - 15 * 60_000).toISOString())
      .gte('created_at', new Date(now.getTime() - 24 * 60 * 60_000).toISOString()).limit(1000);
    if (pendingError) throw pendingError;
    if (pending?.length) {
      const response = await fetch(`${expoEndpoint}/getReceipts`, {
        method: 'POST', headers: expoHeaders, body: JSON.stringify({ ids: pending.map(value => value.ticket_id) }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const payload = await response.json();
        for (const delivery of pending) {
          const receipt = payload.data?.[delivery.ticket_id];
          if (!receipt) continue;
          const code = receipt.details?.error ?? null;
          const { error } = await client.from('reminder_deliveries').update({
            status: receipt.status === 'ok' ? 'delivered' : 'failed', error_code: code,
          }).eq('id', delivery.id);
          if (error) throw error;
          if (code === 'DeviceNotRegistered') {
            const { error: removeError } = await client.from('push_devices').delete().eq('token', delivery.token).eq('user_id', delivery.user_id);
            if (removeError) throw removeError;
          }
        }
      }
    }

    const snapshots = new Map<string, AppState | null>();
    let afterToken = '';
    while (true) {
      const { data: devices, error: deviceError } = await client.from('push_devices')
        .select('*').gt('token', afterToken).order('token').limit(250);
      if (deviceError) throw deviceError;
      if (!devices?.length) break;
      for (const device of devices as Device[]) {
        checked++;
        const { date, hour } = localClock(now, device.timezone);
        if (hour !== device.reminder_hour) continue;
        if (!snapshots.has(device.user_id)) {
          const { data, error } = await client.from('app_snapshots').select('document').eq('user_id', device.user_id).maybeSingle();
          if (error) throw error;
          try { snapshots.set(device.user_id, data ? validateState(data.document) : null); }
          catch { snapshots.set(device.user_id, null); failed++; }
        }
        const state = snapshots.get(device.user_id);
        if (!state) continue;
        const baseline = forecast(state, { asOf: date, horizonDays: 30 });
        const today = baseline.days.find(day => day.date === date);
        const risk = baseline.risks.find(value => value.date <= addDays(date, 7));
        const dueSoon = baseline.days.filter(day => day.date <= addDays(date, 3)).flatMap(day => day.needs)[0];
        const absence = today?.workday ? forecast(state, { asOf: date, horizonDays: 30, absentDates: [date] }) : null;
        const absenceRisk = absence?.risks.find(value => value.shortfall > (baseline.risks.find(base => base.needId === value.needId && base.date === value.date)?.shortfall ?? 0));
        if (!risk && !dueSoon && !absenceRisk) continue;

        let body = 'Ada kebutuhan mendatang. Buka DanaSiap untuk melihat rencana keuanganmu.';
        if (device.include_amounts) {
          if (risk) body = `${risk.title}: perkiraan dana kurang ${currency(risk.shortfall)} pada ${risk.date}.`;
          else if (absenceRisk) body = `Jika hari ini tidak masuk, ${absenceRisk.title} diperkirakan kurang ${currency(absenceRisk.shortfall)}.`;
          else if (dueSoon) body = `${dueSoon.title} sudah dekat. Cek kesiapan dananya atau sesuaikan jadwal.`;
        }
        const { data: claim, error: claimError } = await client.from('reminder_deliveries').insert({
          user_id: device.user_id, token: device.token, local_date: date,
        }).select('id').single();
        if (claimError?.code === '23505') continue;
        if (claimError) throw claimError;
        try {
          const response = await fetch(`${expoEndpoint}/send`, {
            method: 'POST', headers: expoHeaders,
            body: JSON.stringify({
              to: device.token, title: 'Cek rencana DanaSiap', body, sound: 'default',
              channelId: 'financial-reminders', data: { screen: 'plans', date },
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (!response.ok) throw new Error(`EXPO_HTTP_${response.status}`);
          const payload = await response.json();
          const ticket = payload.data as ExpoTicket;
          const ok = ticket?.status === 'ok' && !!ticket.id;
          const code = ok ? null : ticket?.details?.error ?? 'EXPO_REJECTED';
          const { error } = await client.from('reminder_deliveries').update({
            status: ok ? 'accepted' : 'failed', ticket_id: ticket?.id ?? null, error_code: code,
          }).eq('id', claim.id);
          if (error) throw error;
          if (ok) accepted++; else failed++;
          if (code === 'DeviceNotRegistered') {
            const { error: removeError } = await client.from('push_devices').delete().eq('token', device.token).eq('user_id', device.user_id);
            if (removeError) throw removeError;
          }
        } catch {
          failed++;
          await client.from('reminder_deliveries').update({ status: 'failed', error_code: 'DELIVERY_UNCONFIRMED' }).eq('id', claim.id);
        }
      }
      afterToken = devices[devices.length - 1].token;
      if (devices.length < 250) break;
    }
    // Limit retention of operational metadata. Financial snapshots are never removed.
    const { error: cleanupError } = await client.from('reminder_deliveries').delete()
      .lt('created_at', new Date(now.getTime() - 30 * 86400_000).toISOString());
    if (cleanupError) throw cleanupError;
    return json({ checked, accepted, failed });
  } catch (error) {
    console.error('Reminder job failed', error instanceof Error ? error.name : 'database');
    return json({ error: 'Reminder job failed', checked, accepted, failed }, 500);
  }
});
