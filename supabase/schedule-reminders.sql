-- Run once in the Supabase SQL editor after setting the two Vault secrets below.
-- Secrets are provisioned separately, never committed to this file.
-- danasiap_project_url = https://YOUR_PROJECT.supabase.co
-- danasiap_reminder_job_secret = same random >=32-character value as REMINDER_JOB_SECRET
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'danasiap-hourly-reminders',
  '0 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'danasiap_project_url') || '/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Job-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'danasiap_reminder_job_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$
);
