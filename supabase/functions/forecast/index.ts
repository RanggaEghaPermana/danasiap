import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { forecast, validateState } from '../../../packages/core/src/index.ts';
import { corsHeaders, environment, json, localClock } from '../_shared/http.ts';

// JWT verification is explicit so both legacy anon keys and publishable keys work.
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, true);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401, true);

  try {
    const client = createClient(environment('SUPABASE_URL'), environment('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await client.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) return json({ error: 'Invalid or expired session' }, 401, true);
    const { data, error } = await client.from('app_snapshots')
      .select('document,revision,updated_at').eq('user_id', auth.user.id).maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: 'Sync your first snapshot before requesting a forecast' }, 404, true);
    const state = validateState(data.document);
    const asOf = localClock(new Date(), 'Asia/Jakarta').date;
    return json({ ...forecast(state, { asOf, horizonDays: 30 }), revision: data.revision, asOf }, 200, true);
  } catch (error) {
    console.error('Server forecast failed', error instanceof Error ? error.name : 'database');
    return json({ error: 'Unable to calculate forecast. Check the saved financial data and server configuration.' }, 500, true);
  }
});
