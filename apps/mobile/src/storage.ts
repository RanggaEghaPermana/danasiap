import * as SQLite from 'expo-sqlite';
import { AppState, validateState } from '@danasiap/core';

export interface SavedPlan { state: AppState; demo: boolean; reminders: boolean }
const database = SQLite.openDatabaseAsync('danasiap.db');
async function db() {
  const value = await database;
  await value.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS local_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
  return value;
}
export async function loadPlan(): Promise<SavedPlan | null> {
  const row = await (await db()).getFirstAsync<{value: string}>('SELECT value FROM local_settings WHERE key = ?', 'plan');
  if (!row) return null;
  const parsed = JSON.parse(row.value);
  return {state: validateState(parsed.state), demo: parsed.demo === true, reminders: parsed.reminders === true};
}
export async function savePlan(plan: SavedPlan) {
  validateState(plan.state);
  await (await db()).runAsync('INSERT INTO local_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', 'plan', JSON.stringify(plan));
}
