import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { AppState, validateState } from '@danasiap/core';
import { createCloudSync } from '@danasiap/sync';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const cloudConfigured = Boolean(url && publicKey);
export const cloud = cloudConfigured ? createCloudSync<AppState>({
  url: url!, publicKey: publicKey!, validate: validateState,
  storage: {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  },
}) : null;
