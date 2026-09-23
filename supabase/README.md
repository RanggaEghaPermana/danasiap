# DanaSiap cloud backend

This backend stores real account data, with an independent row per user and atomic revision checks. The app works locally before a Supabase project is connected. A missing project is not reported as a successful sync.

## Connect a free Supabase project

1. Create or select a Supabase project under the owner's account. Keep the database password in the owner's password manager.
2. Install/use the official CLI (`pnpm dlx supabase`) and sign in with `supabase login`. Link the project with `supabase link --project-ref PROJECT_REF`, then run `supabase db push` from the repository root. The initial migration does not require any paid extension.
3. Set the deployed web URL in Authentication → URL Configuration. Set the same URL as an allowed redirect URL. Keep email confirmation enabled. Configure an SMTP provider before inviting users outside the personal beta; the default mail service is restricted.
4. Copy only the project URL and publishable key (or legacy `anon` key) to the clients:

   - Web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
   - Android: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

5. Rebuild/redeploy the clients, create an account, confirm its email, and sign in on each device. First sync needs an explicit choice about any existing local data. Never silently replace a populated local snapshot with remote data or vice versa.

Service role keys, database passwords, and job secrets belong only on the server. The TypeScript sync client rejects the Supabase secret-key prefix and legacy service-role JWTs.

## Sync contract

Import `createCloudSync<AppState>({url, publicKey, validate: validateState, storage?})` from `@danasiap/sync`. Android must pass a durable secure auth-storage adapter and initialize `react-native-url-polyfill/auto` before creating the client. `getSession()` returns a session or null; `onAuthStateChange` returns an unsubscribe callback. Do not await another Supabase call from inside the auth callback.

`loadSnapshot()` returns `{data, revision, updatedAt, userId}` or null. `saveSnapshot(data, expectedRevision)` returns that same shape with a new revision. Use revision `0` only when the current account has no cloud snapshot. Persist the revision **per account alongside the last synced local snapshot**. Keep offline edits in local storage, upload only after successful authentication, and only mark them synced after the server confirms the save. A disconnected request is not confirmation, even if the server might have received it.

`SyncConflictError` means the remote snapshot changed. Preserve local data, offer export/backup, then let the user choose or reconcile versions. Do not automatically retry with the newest revision: that would silently erase another device's changes. This beta deliberately rejects conflicting snapshots instead of pretending it can merge financial edits safely.

Sign-out must keep accounts isolated: remove any registered push token before `signOut()`, clear the previous account's state from the active screen, and restore only the matching local account on the next login. Registration moves the physical device to its latest account. Android should call `startAutoRefresh()` and `stopAutoRefresh()` when the app foreground/background state changes.

## Server forecast and reminders

Deploy both functions with `supabase functions deploy forecast` and `supabase functions deploy send-reminders`. Run the CLI from the repository root so the functions include `packages/core/src/index.ts`. Both use the exact same forecast implementation as the clients. `forecast` verifies the user's bearer token through Supabase Auth, reads only that user's snapshot, and returns a 30-day forecast. Its response is not cached.

The reminder endpoint requires a separate random secret of at least 32 characters in `X-Job-Secret`. There is no public reminder trigger. Generate the secret locally, set it as the Edge Function secret `REMINDER_JOB_SECRET`, and save the same value in Supabase Vault under `danasiap_reminder_job_secret`. Add the project URL to Vault under `danasiap_project_url`. Apply `schedule-reminders.sql` in the SQL editor to run hourly. Running this named schedule again updates the existing schedule.

Configure Android FCM credentials for the Expo project and request notification permission on the phone. Register the resulting Expo push token with `registerPushToken(token, {timezone:'Asia/Jakarta', reminderHour:7, includeAmounts:false})`. The Android notification channel must be `financial-reminders`. Expo enhanced push security is optional; if enabled, set the server-only `EXPO_ACCESS_TOKEN` secret. No Expo access token belongs in the APK or the web bundle.

The job checks a device's selected local hour, recalculates from its account's latest **synced** data, and sends only for an upcoming need or cashflow risk. It simulates missing work only when today is a forecast workday. Amounts are hidden by default. Daily database claims prevent duplicate sends during overlapping cron calls. A failed/uncertain delivery is recorded and is not automatically replayed that day, to avoid duplicate financial notifications. Expo receipts are checked on later runs and invalid tokens are removed. A successful receipt only means FCM accepted the notification; it does not guarantee the phone displayed it. Operational delivery records expire after 30 days.

Offline edits cannot change server reminders until they sync. Local Android reminders can cover offline needs; cancel or coordinate them with cloud reminders to avoid duplicates.

## Verification and backup

`pg_virtualenv psql -X -v ON_ERROR_STOP=1 -f supabase/tests/security.sql` creates a disposable PostgreSQL cluster and verifies row isolation, rejected anonymous/direct writes, stale-revision rejection, independent account snapshots, and push-token reassignment. The auth schema in that test is a minimal test double; hosted Auth and push delivery still need a connected project and a real Android device.

For Supabase local integration use `supabase start` and `supabase db reset` on a disposable local database. Run `deno check --config supabase/functions/deno.json supabase/functions/forecast/index.ts supabase/functions/send-reminders/index.ts` to type-check server functions when Deno is installed. Never run the standalone security test against a production database.

Use in-app JSON export for personal backups and scheduled encrypted database exports before wider usage. Review current Supabase free-tier limits and pausing behavior in the project dashboard. The repository has no project/account credentials and does not claim that cloud login, scheduled delivery, or deployment is active until it is configured and tested.

References: [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions), [Supabase password login](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [Expo push sending and receipts](https://docs.expo.dev/push-notifications/sending-notifications/).
