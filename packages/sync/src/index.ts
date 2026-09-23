import { createClient, type AuthChangeEvent, type Session } from '@supabase/supabase-js';

export type { Session, AuthChangeEvent } from '@supabase/supabase-js';

export interface SessionStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface Snapshot<T> {
  data: T;
  revision: number;
  updatedAt: string;
  userId: string;
}

export interface CloudSyncConfig<T> {
  url: string;
  publicKey: string;
  storage?: SessionStorage;
  validate?: (value: unknown) => T;
}

export class SyncConflictError extends Error {
  readonly code = 'SYNC_CONFLICT';
  constructor() {
    super('Ada perubahan dari perangkat lain. Data lokal tetap aman. Muat data cloud atau simpan cadangan sebelum menggabungkan perubahan.');
    this.name = 'SyncConflictError';
  }
}

export class AuthenticationRequiredError extends Error {
  readonly code = 'AUTH_REQUIRED';
  constructor() {
    super('Masuk ke akun untuk menyinkronkan data.');
    this.name = 'AuthenticationRequiredError';
  }
}

type DatabaseSnapshot = { user_id: string; document: unknown; revision: number; updated_at: string };

/** The browser and Android use a public key only. Every mutation is authorized in Postgres. */
export function createCloudSync<T>(config: CloudSyncConfig<T>) {
  if (!config.url || !config.publicKey) throw new Error('Alamat dan public key Supabase belum diatur.');
  if (config.publicKey.startsWith('sb_secret_')) throw new Error('Secret key tidak boleh dipakai di aplikasi. Gunakan publishable/anon key.');
  if (config.publicKey.startsWith('eyJ') && typeof globalThis.atob === 'function') {
    try {
      const part = config.publicKey.split('.')[1];
      const payload = JSON.parse(globalThis.atob(part.replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role === 'service_role') throw new Error('Service role key tidak boleh dipakai di aplikasi.');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Service role')) throw error;
    }
  }

  const client = createClient(config.url, config.publicKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !config.storage,
      ...(config.storage ? { storage: config.storage } : {}),
    },
  });

  async function getSession(): Promise<Session | null> {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function requireSession(): Promise<Session> {
    const session = await getSession();
    if (!session) throw new AuthenticationRequiredError();
    return session;
  }

  function snapshot(row: DatabaseSnapshot): Snapshot<T> {
    if (!Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('Versi data cloud tidak valid.');
    return {
      data: config.validate ? config.validate(row.document) : row.document as T,
      revision: row.revision,
      updatedAt: row.updated_at,
      userId: row.user_id,
    };
  }

  return {
    getSession,

    onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): () => void {
      const { data } = client.auth.onAuthStateChange(callback);
      return () => data.subscription.unsubscribe();
    },

    async signUp(email: string, password: string) {
      const { data, error } = await client.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      return { ...data, confirmationRequired: !data.session };
    },

    async signIn(email: string, password: string): Promise<Session> {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (!data.session) throw new AuthenticationRequiredError();
      return data.session;
    },

    async signOut(): Promise<void> {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    },

    async loadSnapshot(): Promise<Snapshot<T> | null> {
      const session = await requireSession();
      const { data, error } = await client.from('app_snapshots')
        .select('user_id,document,revision,updated_at').eq('user_id', session.user.id)
        .setHeader('Authorization', `Bearer ${session.access_token}`).maybeSingle();
      if (error) throw error;
      return data ? snapshot(data) : null;
    },

    /** expectedRevision=0 creates the first snapshot. Never retry a conflict as an overwrite. */
    async saveSnapshot(data: T, expectedRevision: number, expectedUserId?: string): Promise<Snapshot<T>> {
      const session = await requireSession();
      if (expectedUserId && session.user.id !== expectedUserId) throw new Error('Akun berubah sebelum penyimpanan. Data tetap tersimpan di perangkat.');
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Versi sinkronisasi tidak valid.');
      const document = config.validate ? config.validate(data) : data;
      const { data: saved, error } = await client.rpc('save_snapshot', {
        p_document: document,
        p_expected_revision: expectedRevision,
      }).setHeader('Authorization', `Bearer ${session.access_token}`);
      if (error?.code === 'PT409') throw new SyncConflictError();
      if (error) throw error;
      if (!saved?.[0]) throw new Error('Server tidak mengembalikan konfirmasi penyimpanan.');
      return snapshot(saved[0] as DatabaseSnapshot);
    },

    async registerPushToken(token: string, options: { timezone?: string; reminderHour?: number; includeAmounts?: boolean } = {}): Promise<void> {
      const session = await requireSession();
      const { error } = await client.rpc('register_push_token', {
        p_token: token,
        p_timezone: options.timezone ?? 'Asia/Jakarta',
        p_reminder_hour: options.reminderHour ?? 7,
        p_include_amounts: options.includeAmounts ?? false,
      }).setHeader('Authorization', `Bearer ${session.access_token}`);
      if (error) throw error;
    },

    async unregisterPushToken(token: string): Promise<void> {
      const session = await requireSession();
      const { error } = await client.from('push_devices').delete().eq('user_id', session.user.id).eq('token', token)
        .setHeader('Authorization', `Bearer ${session.access_token}`);
      if (error) throw error;
    },

    // Call these from React Native AppState to avoid background refresh timers.
    startAutoRefresh: () => client.auth.startAutoRefresh(),
    stopAutoRefresh: () => client.auth.stopAutoRefresh(),
  };
}

export type CloudSync<T> = ReturnType<typeof createCloudSync<T>>;
