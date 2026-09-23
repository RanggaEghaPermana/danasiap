import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState as NativeAppState, Dimensions, Image, Keyboard, LayoutAnimation, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, UIManager, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useFonts, BarlowCondensed_500Medium, BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed';
import { DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import Svg, { Circle, ClipPath, Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { AppState, Attendance, FinancialAction, Need, addDays, balance, calculatePayroll, currency, defaultState, demoState, forecast, formatThousands, getHoliday, isNationalHoliday, isWorkday, localDate, parseThousands, reducer, remainingAmount, validateState } from '@danasiap/core';
import { loadPlan, savePlan } from './storage';
import { enableReminders, scheduleReminders } from './notifications';
import { cloud, cloudConfigured } from './cloud';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { colors as c, styles as s } from './theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type IconName = React.ComponentProps<typeof Feather>['name'];
type Tab = 'home' | 'needs' | 'calendar' | 'insights';
type Sheet = 'expense' | 'income' | 'need' | 'attendance' | 'settings' | 'setup' | 'cloud' | 'backup' | null;
const weekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const shortDate = (date: string) => new Date(`${date}T12:00:00+07:00`).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta'});
const number = (input: string) => parseThousands(input);
function Icon({name, size = 19, color = c.ink}: {name: IconName; size?: number; color?: string}) { return <Feather name={name} size={size} color={color} />; }
function Grid({dark = false}: {dark?: boolean}) {
  return <Svg pointerEvents="none" style={{position: 'absolute', top: 0, bottom: 0, left: 0, right: 0}} width="100%" height="100%"><Pattern id="grid" x="0" y="0" width="39" height="39" patternUnits="userSpaceOnUse"><Path d="M 39 0 L 0 0 0 39" fill="none" stroke={dark ? '#49503E' : '#87A454'} strokeOpacity={dark ? .21 : .08} strokeWidth=".8" /></Pattern><Rect width="100%" height="100%" fill="url(#grid)" /></Svg>;
}
function PanelNotch() { return <View pointerEvents="none" style={{position: 'absolute', top: -1, left: '50%', marginLeft: -16, height: 8, width: 32, backgroundColor: c.pale, borderBottomLeftRadius: 20, borderBottomRightRadius: 20}} />; }

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

function AnimatedPressable({
  onPress,
  children,
  style,
  scaleTo = 0.94,
  disabled,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityState,
  hitSlop,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  style?: any;
  scaleTo?: number;
  disabled?: boolean;
  accessibilityRole?: any;
  accessibilityLabel?: string;
  accessibilityState?: any;
  hitSlop?: any;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: scaleTo,
      useNativeDriver: true,
      speed: 45,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 8,
    }).start();
  };

  return (
    <AnimatedPressableBase
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      hitSlop={hitSlop}
      style={[{transform: [{scale}]}, style]}
    >
      {children}
    </AnimatedPressableBase>
  );
}

function CardChip() {
  return (
    <Svg width="36" height="26" viewBox="0 0 38 28" fill="none">
      <Rect width="38" height="28" rx="5" fill="#c8ed69" fillOpacity={0.22} stroke="#c8ed69" strokeWidth="1.2" />
      <Rect x="2" y="2" width="34" height="24" rx="3.5" fill="#c8ed69" fillOpacity="0.08" />
      <Path d="M0 10H14M0 18H14M24 10H38M24 18H38M14 4V24M24 4V24M14 14H24" stroke="#c8ed69" strokeWidth="1.2" strokeLinecap="round" opacity={0.85} />
      <Circle cx="19" cy="14" r="2.5" fill="#c8ed69" opacity={0.7} />
    </Svg>
  );
}

function WalletBackground({width = 350, height = 240}: {width?: number; height?: number}) {
  const r = 24;
  const notchW = 126;
  const notchH = 38;
  const x1 = Math.max(r, width - notchW);
  const x2 = x1 + 24;

  const outline = [
    `M ${r} 0`,
    `H ${x1}`,
    `C ${x1 + 12} 0, ${x1 + 12} ${notchH}, ${x2} ${notchH}`,
    `H ${width - r}`,
    `C ${width - 8} ${notchH}, ${width} ${notchH + 8}, ${width} ${notchH + r}`,
    `V ${height - r}`,
    `C ${width} ${height - 8}, ${width - 8} ${height}, ${width - r} ${height}`,
    `H ${r}`,
    `C 8 ${height}, 0 ${height - 8}, 0 ${height - r}`,
    `V ${r}`,
    `C 0 8, 8 0, ${r} 0`,
    `Z`,
  ].join(' ');

  return (
    <Svg pointerEvents="none" width={width} height={height} style={{position: 'absolute', top: 0, left: 0}}>
      <Defs>
        <ClipPath id="walletNotchClip">
          <Path d={outline} />
        </ClipPath>
      </Defs>
      <Path d={outline} fill={c.ink} />
      <G clipPath="url(#walletNotchClip)">
        {Array.from({length: 22}, (_, i) => (
          <Path
            key={i}
            d={`M ${-90 + i * 18} -40 C ${100 + i * 12} 30 ${-70 + i * 20} 140 ${140 + i * 14} 270`}
            fill="none"
            stroke="#6B785B"
            strokeWidth="0.8"
            opacity="0.18"
          />
        ))}
      </G>
    </Svg>
  );
}
function Button({title, onPress, secondary, disabled, icon}: {title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: IconName}) {
  return (
    <AnimatedPressable
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.96}
      style={[s.button, secondary && s.secondaryButton, disabled && {opacity: .45}]}
    >
      {icon && <Icon name={icon} size={17} color={secondary ? c.ink : c.lime} />}
      <Text style={[s.buttonText, secondary && {color: c.ink}]}>{title}</Text>
    </AnimatedPressable>
  );
}
function Field({label, value, onChange, placeholder, numeric, secret, multiline}: {label: string; value: string; onChange: (value: string) => void; placeholder?: string; numeric?: boolean; secret?: boolean; multiline?: boolean}) {
  const handleChange = (text: string) => {
    if (numeric) {
      if (text === '') {
        onChange('');
      } else {
        const num = parseThousands(text);
        onChange(formatThousands(num));
      }
    } else {
      onChange(text);
    }
  };
  return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={numeric ? (value ? formatThousands(value) : '') : value} onChangeText={handleChange} placeholder={placeholder ?? (numeric ? '0' : undefined)} placeholderTextColor="#A0A995" keyboardType={numeric ? 'numeric' : 'default'} autoCapitalize={secret || multiline || label.toLowerCase().includes('email') ? 'none' : 'sentences'} autoCorrect={!multiline && !secret} spellCheck={!multiline && !secret} secureTextEntry={secret} multiline={multiline} style={[s.input, multiline && {height: 120, textAlignVertical: 'top'}]} /></View>;
}
function SectionHead({title, action, onPress}: {title: string; action?: string; onPress?: () => void}) {
  return (
    <View style={s.between}>
      <Text style={s.heading}>{title}</Text>
      {action && (
        <AnimatedPressable accessibilityRole="button" onPress={onPress} hitSlop={12} scaleTo={0.92}>
          <Text style={[s.mini, {color: c.ink, fontWeight: '600'}]}>{action}  ↗</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}
function Empty({text}: {text: string}) { return <View style={s.empty}><Icon name="layers" color={c.muted} size={25} /><Text style={[s.muted, {textAlign: 'center'}]}>{text}</Text></View>; }
function Notice({title, text, icon = 'zap'}: {title: string; text: string; icon?: IconName}) {
  return <View style={s.notice}><Icon name={icon} size={19} /><View style={{flex: 1}}><Text style={s.noticeTitle}>{title}</Text><Text style={[s.muted, {color: '#63744F'}]}>{text}</Text></View></View>;
}
function Chip({label, active, onPress}: {label: string; active: boolean; onPress: () => void}) {
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityState={{selected: active}}
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        onPress();
      }}
      scaleTo={0.93}
      style={[s.tab, active && s.tabActive]}
    >
      <Text style={[s.actionLabel, active && {color: c.ink, fontWeight: 'bold'}]}>{label}</Text>
    </AnimatedPressable>
  );
}

export default function App() {
  const [fonts, fontError] = useFonts({Barlow: BarlowCondensed_600SemiBold, BarlowMedium: BarlowCondensed_500Medium, DM: DMSans_400Regular, DMMedium: DMSans_500Medium});
  if (!fonts && !fontError) return <View style={[s.screen, {alignItems: 'center', justifyContent: 'center'}]}><ActivityIndicator color={c.ink} /></View>;
  return <SafeAreaProvider><StatusBar style="dark" /><DanaSiap /></SafeAreaProvider>;
}

function DanaSiap() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<AppState>(defaultState());
  const current = useRef(state);
  const tabAnim = useRef(new Animated.Value(1)).current;
  const [cardSize, setCardSize] = useState(() => ({
    width: Math.max(300, Dimensions.get('window').width - 44),
    height: 240,
  }));
  const [loaded, setLoaded] = useState(false);
  const [started, setStarted] = useState(false);
  const [demo, setDemo] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [today, setToday] = useState(localDate());
  const [selectedDay, setSelectedDay] = useState(today);
  const [storageError, setStorageError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState(30);
  const [needFilter, setNeedFilter] = useState<'all' | 'debt' | 'recurring' | 'goal'>('all');
  const [editingNeed, setEditingNeed] = useState<Need | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [allocatedInput, setAllocatedInput] = useState('0');
  const [form, setForm] = useState({title: '', amount: '', date: today, category: 'Makan', kind: 'recurring', interval: '7', saved: '0', priority: 'essential'});
  const [profile, setProfile] = useState({name: '', dailyIncome: '', dailyBudget: '', openingBalance: '', workDays: [1, 2, 3, 4, 5, 6] as number[], activityAllowance: '', payrollCycle: 'daily' as 'daily' | 'monthly', payday: '5', avatarUrl: undefined as string | undefined});
  const [attStatus, setAttStatus] = useState<Attendance['status']>('present');
  const [attIncome, setAttIncome] = useState('');
  const [attAllowance, setAttAllowance] = useState('');
  const [attAllowancePct, setAttAllowancePct] = useState<number>(100);
  const [attDeductionPct, setAttDeductionPct] = useState<number>(0);
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudUser, setCloudUser] = useState('');
  const [cloudMessage, setCloudMessage] = useState('');
  const [backupText, setBackupText] = useState('');
  const [backupPreview, setBackupPreview] = useState<{name: string; txCount: number; needsCount: number; validState: AppState} | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const writes = useRef(Promise.resolve());
  const projection = useMemo(() => forecast(state, {asOf: today, horizonDays: period}), [state, today, period]);
  const absence = useMemo(() => forecast(state, {asOf: today, horizonDays: period, absentDates: [selectedDay]}), [state, today, period, selectedDay]);
  const payroll = useMemo(() => calculatePayroll(state, today), [state, today]);
  const activeNeeds = [...state.needs].filter(n => !n.paid).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const todayAttendance = state.attendance.find(a => a.date === today);
  const todayIsWorkday = isWorkday(state, today);

  useEffect(() => {
    loadPlan().then(plan => {if (plan) {setState(plan.state); current.current = plan.state; setDemo(plan.demo); setReminders(plan.reminders); setStarted(true);}}).catch(() => setStorageError('Data lokal belum bisa dibaca. Jangan menimpa data; tutup lalu buka lagi aplikasi.')).finally(() => setLoaded(true));
    const subscription = NativeAppState.addEventListener('change', status => {if (status === 'active') {setToday(localDate()); cloud?.startAutoRefresh();} else cloud?.stopAutoRefresh();});
    if (cloud) cloud.getSession().then(session => setCloudUser(session?.user.email ?? '')).catch(() => {});
    const unsubscribe = cloud?.onAuthStateChange((_event, session) => setCloudUser(session?.user.email ?? ''));
    return () => {subscription.remove(); unsubscribe?.();};
  }, []);
  useEffect(() => {
    if (!started) return;
    scheduleReminders(state, reminders && !demo).catch(() => setStorageError('Pengingat belum berhasil diperbarui. Buka pengaturan lalu aktifkan kembali.'));
  }, [state, reminders, demo, started]);

  async function copyBackupToClipboard() {
    try {
      const payload = JSON.stringify({version: 1, state}, null, 2);
      await Clipboard.setStringAsync(payload);
      Alert.alert('Cadangan Disalin', 'Seluruh data cadangan JSON berhasil disalin ke clipboard perangkat.');
    } catch {
      Alert.alert('Gagal Menyalin', 'Tidak dapat mengakses clipboard perangkat.');
    }
  }

  async function shareBackupJson() {
    try {
      const payload = JSON.stringify({version: 1, state}, null, 2);
      try {
        await Clipboard.setStringAsync(payload);
      } catch {}
      await Share.share(
        {
          message: payload,
          title: 'Cadangan DanaSiap',
        },
        {
          dialogTitle: 'Bagikan Cadangan DanaSiap',
        }
      );
    } catch {
      Alert.alert('Cadangan Tersalin', 'Cadangan JSON telah disalin ke clipboard agar tetap dapat disimpan secara manual.');
    }
  }

  function persist(next: AppState, nextDemo = demo, nextReminders = reminders) {
    current.current = next; setState(next);
    writes.current = writes.current.then(() => savePlan({state: next, demo: nextDemo, reminders: nextReminders})).catch(() => setStorageError('Perubahan belum tersimpan ke perangkat. Ruang penyimpanan mungkin penuh.'));
  }
  function dispatch(action: FinancialAction) {
    try {const next = reducer(current.current, action); persist(next); setFormError(''); return true;} catch (error) {setFormError(error instanceof Error ? error.message : 'Periksa kembali isianmu.'); return false;}
  }
  function open(next: Sheet) {
    setFormError(''); setCloudMessage(''); setSheet(next);
    if (next === 'expense' || next === 'income' || next === 'need') setForm({title: '', amount: '', date: today, category: 'Makan', kind: 'recurring', interval: '7', saved: '', priority: 'essential'});
    if (next === 'setup') setProfile({name: state.profile.name, dailyIncome: state.profile.dailyIncome ? formatThousands(state.profile.dailyIncome) : '', dailyBudget: state.profile.dailyBudget ? formatThousands(state.profile.dailyBudget) : '', openingBalance: state.profile.openingBalance ? formatThousands(state.profile.openingBalance) : '', workDays: [...state.profile.workDays], activityAllowance: state.profile.activityAllowance ? formatThousands(state.profile.activityAllowance) : '', payrollCycle: state.profile.payrollCycle ?? 'daily', payday: String(state.profile.payday ?? 5), avatarUrl: state.profile.avatarUrl});
    if (next === 'attendance') {
      const existing = state.attendance.find(a => a.date === selectedDay);
      const defaultStatus = existing?.status ?? (isWorkday(state, selectedDay) ? 'present' : 'holiday');
      setAttStatus(defaultStatus);
      const inc = existing?.income ?? (defaultStatus === 'half' ? state.profile.dailyIncome : defaultStatus === 'present' ? state.profile.dailyIncome : 0);
      setAttIncome(formatThousands(inc));
      let pct = 0;
      if (defaultStatus === 'half') {
        if (inc === state.profile.dailyIncome) pct = 0;
        else if (inc === Math.floor(state.profile.dailyIncome * 0.75)) pct = 25;
        else if (inc === Math.floor(state.profile.dailyIncome * 0.5)) pct = 50;
        else if (inc === Math.floor(state.profile.dailyIncome * 0.25)) pct = 75;
        else pct = -1;
      }
      setAttDeductionPct(pct);
      const defAllowance = state.profile.activityAllowance ?? 0;
      const allVal = existing?.allowance !== undefined ? existing.allowance : defAllowance;
      setAttAllowance(formatThousands(allVal));
      let allPct = 100;
      if (defAllowance > 0) {
        if (allVal === defAllowance) allPct = 100;
        else if (allVal === Math.floor(defAllowance * 0.75)) allPct = 75;
        else if (allVal === Math.floor(defAllowance * 0.5)) allPct = 50;
        else if (allVal === Math.floor(defAllowance * 0.25)) allPct = 25;
        else if (allVal === 0) allPct = 0;
        else allPct = -1;
      }
      setAttAllowancePct(allPct);
    }
  }
  function startDemo() {
    const sample = demoState(today); setDemo(true); setReminders(false); persist(sample, true, false); setStarted(true);
  }
  function saveForm() {
    if (!form.title.trim()) {setFormError('Tulis nama transaksi atau kebutuhan dulu.'); return;}
    const amount = number(form.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {setFormError('Nominal harus berupa rupiah bulat, lebih dari nol.'); return;}
    if (sheet === 'need') {
      if (dispatch({type: 'need/add', need: {id: uid(), title: form.title.trim(), amount, saved: number(form.saved || '0'), dueDate: form.date, kind: form.kind as Need['kind'], ...(form.kind === 'recurring' ? {intervalDays: number(form.interval)} : {}), priority: form.priority as Need['priority']}})) setSheet(null);
    } else {
      if (dispatch({type: 'transaction/add', transaction: {id: uid(), title: form.title.trim(), amount, date: form.date, category: sheet === 'income' ? 'Pemasukan lain' : form.category, type: sheet === 'income' ? 'income' : 'expense'}})) setSheet(null);
    }
  }
  function saveProfile() {
    if (!profile.name.trim()) {setFormError('Isi nama panggilanmu.'); return;}
    const dailyIncome = number(profile.dailyIncome || '0'), dailyBudget = number(profile.dailyBudget || '0'), openingBalance = number(profile.openingBalance || '0'), activityAllowance = number(profile.activityAllowance || '0'), payday = number(profile.payday || '5');
    if (![dailyIncome, dailyBudget, openingBalance, activityAllowance, payday].every(v => Number.isSafeInteger(v) && v >= 0)) {setFormError('Nominal harus rupiah bulat dan tidak negatif.'); return;}
    if (dispatch({type: 'profile/update', profile: {...profile, name: profile.name.trim(), dailyIncome, dailyBudget, openingBalance, activityAllowance, payrollCycle: profile.payrollCycle, payday, avatarUrl: profile.avatarUrl}})) {setStarted(true); setSheet(null);}
  }
  async function pickAvatar() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Izin Galeri Diperlukan', 'Buka pengaturan perangkat untuk mengizinkan akses galeri foto.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.4,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        let dataUrl = '';
        if (asset.base64) {
          const mime = asset.mimeType || 'image/jpeg';
          dataUrl = `data:${mime};base64,${asset.base64}`;
        } else if (asset.uri) {
          dataUrl = asset.uri;
        }
        if (dataUrl) {
          if (dataUrl.length > 500_000) {
            Alert.alert('Ukuran Foto Terlalu Besar', 'Silakan pilih foto lain atau gunakan resolusi lebih kecil.');
            return;
          }
          dispatch({type: 'profile/update', profile: {avatarUrl: dataUrl}});
          setProfile(p => ({...p, avatarUrl: dataUrl}));
        }
      }
    } catch (err) {
      Alert.alert('Gagal Memilih Foto', err instanceof Error ? err.message : 'Terjadi kesalahan saat memilih foto.');
    }
  }
  function removeAvatar() {
    dispatch({type: 'profile/update', profile: {avatarUrl: undefined}});
    setProfile(p => ({...p, avatarUrl: undefined}));
  }
  function recordAttendance() {
    const income = attStatus === 'absent' || attStatus === 'holiday' ? 0 : number(attIncome);
    if (!Number.isSafeInteger(income) || income < 0) {setFormError('Pemasukan harus rupiah bulat dan tidak negatif.'); return;}
    let allowance: number | undefined = undefined;
    if (attStatus === 'half' && state.profile.activityAllowance) {
      const allNum = number(attAllowance);
      if (!Number.isSafeInteger(allNum) || allNum < 0) {
        setFormError('Uang saku harus rupiah bulat dan tidak negatif.');
        return;
      }
      allowance = allNum;
    }
    if (dispatch({type: 'attendance/record', attendance: {date: selectedDay, status: attStatus, income, allowance}})) setSheet(null);
  }
  function confirmPay(need: Need) {
    Alert.alert(`Bayar ${need.title}?`, `${currency(remainingAmount(need))} akan dicatat sebagai pengeluaran hari ini.${need.kind === 'recurring' ? ' Jadwal berikutnya dihitung dari tanggal pembayaran.' : ''}`, [{text: 'Batal', style: 'cancel'}, {text: 'Ya, sudah dibayar', onPress: () => {if (dispatch({type: 'need/pay', id: need.id, date: today})) setEditingNeed(null);}}]);
  }
  async function runCloud(task: () => Promise<void>) {setBusy(true); setCloudMessage(''); try {await task();} catch (error) {setCloudMessage(error instanceof Error ? error.message : 'Koneksi belum berhasil. Coba lagi nanti.');} finally {setBusy(false);}}
  async function upload() {
    if (!cloud) return;
    if (demo) {setCloudMessage('Data contoh tidak diunggah. Mulai data pribadi dulu.'); return;}
    const remote = await cloud.loadSnapshot();
    if (remote) {
      Alert.alert('Perbarui data cloud?', 'Data cloud akan diganti oleh data dari perangkat ini. Pastikan perangkat ini berisi perubahan terbaru.', [{text: 'Batal', style: 'cancel'}, {text: 'Unggah data ini', onPress: () => runCloud(async () => {await cloud!.saveSnapshot(current.current, remote.revision); setCloudMessage('Data tersimpan di cloud. Di web, pilih ambil dari cloud.');})}]);
    } else {await cloud.saveSnapshot(current.current, 0); setCloudMessage('Data pertama berhasil tersimpan di cloud.');}
  }
  async function download() {
    if (!cloud) return;
    const remote = await cloud.loadSnapshot();
    if (!remote) {setCloudMessage('Belum ada data di cloud. Unggah dari perangkat utama dulu.'); return;}
    Alert.alert('Ambil data cloud?', 'Data pada perangkat ini akan diganti dengan data cloud. Buat cadangan terlebih dahulu jika diperlukan.', [{text: 'Batal', style: 'cancel'}, {text: 'Ambil data', onPress: () => {setDemo(false); persist(remote.data, false); setCloudMessage('Data cloud sudah tersimpan di perangkat ini.');}}]);
  }
  if (!loaded) return <SafeAreaView style={[s.screen, {justifyContent: 'center'}]}><ActivityIndicator color={c.ink} /></SafeAreaView>;

  const welcome = <SafeAreaView style={s.welcome}>
    <Grid /><View style={s.between}><View style={[s.row, {gap: 7}]}><Icon name="aperture" size={23} /><Text style={[s.heading, {fontSize: 24}]}>DanaSiap</Text></View><Text style={[s.mini, {color: c.ink}]}>KEUANGAN PRIBADI</Text></View>
    <Image source={require('../assets/welcome.png')} resizeMode="contain" style={{width: '100%', height: '41%', alignSelf: 'center'}} />
    <View style={{gap: 17}}><Text style={s.welcomeTitle}>Uang hari ini.{`\n`}Tenang untuk{`\n`}hari nanti. <Text style={{fontSize: 42}}>↗</Text></Text><Text style={[s.body, {lineHeight: 21, maxWidth: 290}]}>Kerja, nabung, dan kebutuhanmu.{`\n`}Semuanya punya rencana.</Text>
      {storageError ? <Text style={s.error}>{storageError}</Text> : <><Button title="Mulai rencana gue" icon="arrow-up-right" onPress={() => open('setup')} /><AnimatedPressable accessibilityRole="button" onPress={startDemo} style={{padding: 9, alignItems: 'center'}} scaleTo={0.94}><Text style={s.actionLabel}>Lihat dulu dengan data contoh →</Text></AnimatedPressable></>}
    </View>
  </SafeAreaView>;

  function switchTab(nextTab: Tab) {
    if (nextTab === tab) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    tabAnim.setValue(0);
    setTab(nextTab);
    Animated.timing(tabAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  function NeedRow({need, compact = false}: {need: Need; compact?: boolean}) {
    const risk = projection.risks.find(r => r.needId === need.id);
    return (
      <AnimatedPressable
        accessibilityLabel={`Detail ${need.title}`}
        onPress={() => {setFormError(''); setRescheduleDate(need.dueDate); setAllocatedInput(formatThousands(need.saved)); setEditingNeed(need);}}
        scaleTo={0.97}
        style={{gap: 10, paddingVertical: 5}}
      >
        <View style={[s.row, {gap: 11}]}>
          <View style={[s.needIcon, {backgroundColor: need.kind === 'debt' ? '#ECF2DE' : '#F4F7EE'}]}>
            <Icon name={need.kind === 'debt' ? 'credit-card' : need.kind === 'recurring' ? 'zap' : 'target'} size={18} />
          </View>
          <View style={{flex: 1, gap: 4}}>
            <Text style={s.listTitle}>{need.title}</Text>
            <Text style={s.mini}>{shortDate(need.dueDate)} · {need.kind === 'recurring' ? `Setiap ${need.intervalDays} hari` : need.kind === 'debt' ? 'Utang' : 'Target'}</Text>
          </View>
          <View style={{alignItems: 'flex-end', gap: 3}}>
            <Text style={s.amount}>{currency(remainingAmount(need))}</Text>
            <Text style={[s.mini, risk && {color: c.red}]}>{risk ? `Kurang ${currency(risk.shortfall)}` : 'Terencana'}</Text>
          </View>
        </View>
        {!compact && (
          <>
            <View style={s.progress}><View style={[s.progressFill, {width: `${Math.min(100, need.saved / need.amount * 100)}%`}]} /></View>
            <View style={s.between}><Text style={s.mini}>Dialokasikan {currency(need.saved)}</Text><Text style={s.mini}>{Math.round(need.saved / need.amount * 100)}%</Text></View>
          </>
        )}
      </AnimatedPressable>
    );
  }
  const transactions = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const header = (
    <View style={s.header}>
      <AnimatedPressable
        accessibilityLabel="Buka pengaturan profil"
        style={[s.row, {gap: 10}]}
        onPress={() => open('settings')}
        scaleTo={0.96}
      >
        <View style={[s.avatar, {overflow: 'hidden'}]}>
          {state.profile.avatarUrl ? (
            <Image source={{uri: state.profile.avatarUrl}} style={{width: 42, height: 42}} />
          ) : (
            <Text style={s.avatarText}>{state.profile.name.slice(0, 1).toUpperCase() || 'D'}</Text>
          )}
        </View>
        <View>
          <Text style={s.mini}>Halo, {state.profile.name || 'teman'} 👋</Text>
          <Text style={[s.heading, {fontSize: 22}]}>Siap untuk hari ini?</Text>
        </View>
      </AnimatedPressable>
      <AnimatedPressable
        accessibilityLabel="Lihat peringatan"
        style={s.circle}
        scaleTo={0.9}
        onPress={() => Alert.alert('Peringatan DanaSiap', projection.risks.length ? projection.risks.map(r => `${r.title} (${shortDate(r.date)}): diprediksi kurang ${currency(r.shortfall)}`).join('\n\n') : 'Belum ada kekurangan yang diprediksi berdasarkan rencana saat ini.')}
      >
        <Icon name="bell" size={19} />
        {projection.risks.length > 0 && <View style={{position: 'absolute', width: 6, height: 6, backgroundColor: '#D97553', borderRadius: 4, top: 10, right: 12}} />}
      </AnimatedPressable>
    </View>
  );

  const home = <>
    {header}
    {demo && (
      <AnimatedPressable
        onPress={() => open('settings')}
        scaleTo={0.97}
        style={[s.between, {padding: 9, backgroundColor: '#E2EFD0', borderRadius: 11}]}
      >
        <Text style={s.mini}>DATA CONTOH · bukan saldo pribadi</Text>
        <Icon name="arrow-up-right" size={14} />
      </AnimatedPressable>
    )}
    <View
      style={s.card}
      onLayout={(e) => {
        const {width, height} = e.nativeEvent.layout;
        if (width > 0 && height > 0 && (Math.abs(width - cardSize.width) > 1 || Math.abs(height - cardSize.height) > 1)) {
          setCardSize({width, height});
        }
      }}
    >
      <WalletBackground width={cardSize.width} height={cardSize.height} />

      {/* Brand row: DANASIAP */}
      <View style={[s.row, {gap: 7, height: 26, alignItems: 'center'}]}>
        <View style={{width: 18, height: 18, borderRadius: 9, backgroundColor: c.lime + '2B', alignItems: 'center', justifyContent: 'center'}}>
          <Icon name="aperture" size={11} color={c.lime} />
        </View>
        <Text style={[s.cardName, {letterSpacing: 1.8, fontSize: 11, fontFamily: 'BarlowMedium'}]}>DANASIAP</Text>
      </View>

      {/* Balance section with EMV Chip */}
      <View style={{marginTop: 18}}>
        <View style={[s.row, {gap: 12, alignItems: 'center'}]}>
          <Text style={s.cardLabel}>Total saldo kamu</Text>
          <CardChip />
        </View>
        <Text style={[s.cardBalance, {fontSize: 36, marginTop: 4}]}>{currency(balance(state))}</Text>
      </View>

      {/* Safe to spend section */}
      <View style={{marginTop: 18}}>
        <Text style={[s.cardLabel, {fontSize: 9.5, letterSpacing: 1.2, color: '#97A588'}]}>AMAN DIPAKAI SEKARANG</Text>
        <Text style={[s.cardBalance, {fontSize: 24, color: c.lime, marginTop: 3}]}>{currency(projection.safeToSpend)}</Text>
      </View>

      {/* Right accent stripe */}
      <View style={s.cardStripe}>
        <View style={{transform: [{rotate: '90deg'}]}}>
          <Icon name="wifi" size={24} color={c.ink} />
        </View>
      </View>

      {/* Atur dana pill button in the notch cutout */}
      <AnimatedPressable
        accessibilityLabel="Atur dana"
        onPress={() => switchTab('needs')}
        style={s.cardAturDana}
        scaleTo={0.92}
      >
        <View style={s.cardAturDanaPlus}>
          <Icon name="plus" size={10} color={c.lime} />
        </View>
        <Text style={s.cardAturDanaText}>Atur dana</Text>
      </AnimatedPressable>
    </View>

    {/* Quick Action Shortcuts */}
    <View style={s.between}>
      {([
        {name: 'arrow-up-right', label: 'Uang keluar', action: () => open('expense')},
        {name: 'arrow-down-left', label: 'Uang masuk', action: () => open('income')},
        {name: 'calendar', label: 'Absensi', action: () => {
          setSelectedDay(today);
          setAttStatus(todayAttendance?.status ?? 'present');
          setAttIncome(formatThousands(todayAttendance?.income ?? state.profile.dailyIncome));
          setSheet('attendance');
          setFormError('');
        }},
        {name: 'grid', label: 'Lainnya', action: () => open('settings')},
      ] as {name: IconName; label: string; action: () => void}[]).map((item, i) => (
        <AnimatedPressable
          key={item.label}
          accessibilityLabel={item.label}
          onPress={item.action}
          style={s.shortcut}
          scaleTo={0.91}
        >
          <View style={[s.shortcutCircle, i === 3 && {backgroundColor: c.lime}]}>
            <Icon name={item.name} size={23} />
          </View>
          <Text style={s.actionLabel}>{item.label}</Text>
        </AnimatedPressable>
      ))}
    </View>

    <View style={s.section}>
      <PanelNotch />
      <SectionHead title="Estimasi Gajian & Akumulasi" action={payroll.daysUntilPayday === 0 ? 'Hari ini cair!' : `${payroll.daysUntilPayday} hari lagi`} />
      <View style={s.between}>
        <View>
          <Text style={s.mini}>Proyeksi gaji akhir bulan (cair {shortDate(payroll.nextPayday)})</Text>
          <Text style={[s.number, {fontSize: 24, marginTop: 4}]}>{currency(payroll.projectedMonthEnd)}</Text>
        </View>
      </View>
      <View style={[s.divider, {marginVertical: 9}]} />
      <View style={s.between}>
        <Text style={s.mini}>Hak gaji terkumpul s/d hari ini</Text>
        <Text style={[s.body, {fontFamily: 'BarlowMedium'}]}>{currency(payroll.accruedCurrentMonth)}</Text>
      </View>
      <View style={s.between}>
        <Text style={s.mini}>Kehadiran kerja bulan ini</Text>
        <Text style={[s.body, {fontFamily: 'BarlowMedium'}]}>{payroll.actualWorkdays} / {payroll.totalMonthWorkdays} hari</Text>
      </View>
      {state.profile.activityAllowance ? (
        <View style={s.between}>
          <Text style={s.mini}>Uang saku cash diterima</Text>
          <Text style={[s.body, {fontFamily: 'BarlowMedium'}]}>{currency(payroll.allowanceReceived)}</Text>
        </View>
      ) : null}
    </View>

    <View style={s.section}>
      <PanelNotch />
      <SectionHead title="Kebutuhan terdekat" action="Lihat semua" onPress={() => switchTab('needs')} />
      {activeNeeds.length ? (
        activeNeeds.slice(0, 3).map((need, i) => (
          <React.Fragment key={need.id}>
            {i > 0 && <View style={s.divider} />}
            <NeedRow need={need} compact />
          </React.Fragment>
        ))
      ) : (
        <Empty text="Belum ada kebutuhan. Tambahkan bensin, utang, atau tujuan pertamamu." />
      )}
    </View>

    <View style={s.section}>
      <PanelNotch />
      <SectionHead title="Aktivitas terbaru" action="Semua" onPress={() => switchTab('insights')} />
      {transactions.length ? (
        transactions.slice(0, 4).map((t, i) => (
          <React.Fragment key={t.id}>
            {i > 0 && <View style={s.divider} />}
            <View style={[s.row, {gap: 11}]}>
              <View style={[s.needIcon, {backgroundColor: c.ink}]}>
                <Icon name={t.type === 'income' ? 'arrow-down-left' : 'shopping-bag'} size={17} color={c.white} />
              </View>
              <View style={{flex: 1, gap: 4}}>
                <Text style={s.listTitle}>{t.title}</Text>
                <Text style={s.mini}>{shortDate(t.date)} · {t.category}</Text>
              </View>
              <Text style={s.amount}>{t.type === 'income' ? '+' : '−'}{currency(t.amount)}</Text>
            </View>
          </React.Fragment>
        ))
      ) : (
        <Empty text="Catat pengeluaran pertamamu lewat tombol + di bawah." />
      )}
    </View>

    <Notice
      title={projection.shortfall > 0 ? `Ada potensi kurang ${currency(projection.shortfall)}` : todayIsWorkday ? 'Satu hari kerja, satu langkah lagi.' : 'Hari ini libur. Rencana tetap jalan.'}
      text={projection.shortfall > 0 ? 'Cek rencana dan simulasi absensi supaya kebutuhan tetap kebayar tepat waktu.' : todayIsWorkday ? `Target alokasi ${currency(projection.requiredDaily)} per hari kerja. Catat kehadiran untuk prediksi terbaru.` : 'Pemasukan hari libur tidak dihitung. Pengeluaran dan jatuh tempo tetap diperhitungkan.'}
    />
  </>;

  const needsScreen = <>
    <View style={s.between}>
      <View>
        <Text style={s.mini}>SATU PER SATU, JADI SIAP</Text>
        <Text style={[s.title, {fontSize: 33}]}>Rencana kebutuhan</Text>
      </View>
      <AnimatedPressable accessibilityLabel="Tambah kebutuhan" onPress={() => open('need')} style={[s.circle, {backgroundColor: c.lime}]} scaleTo={0.9}>
        <Icon name="plus" />
      </AnimatedPressable>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, paddingVertical: 2}} style={{flexGrow: 0}}>
      {([{key: 'all', name: 'Semua'}, {key: 'debt', name: 'Utang'}, {key: 'recurring', name: 'Rutin'}, {key: 'goal', name: 'Tujuan'}] as const).map(item => (
        <Chip key={item.key} label={item.name} active={needFilter === item.key} onPress={() => setNeedFilter(item.key)} />
      ))}
    </ScrollView>
    <View style={[s.row, {gap: 10}]}>
      <View style={s.stat}>
        <Text style={s.mini}>Sudah dialokasikan</Text>
        <Text style={s.number}>{currency(projection.allocated)}</Text>
        <Icon name="layers" />
      </View>
      <View style={[s.stat, {backgroundColor: c.ink}]}>
        <Text style={[s.mini, {color: '#B3BDA8'}]}>Target / hari kerja</Text>
        <Text style={[s.number, {color: c.white}]}>{currency(projection.requiredDaily)}</Text>
        <Text style={[s.mini, {color: '#B3BDA8'}]}>{projection.workdays} hari kerja dalam periode</Text>
      </View>
    </View>
    {activeNeeds.filter(n => needFilter === 'all' || n.kind === needFilter).map(n => (
      <View style={s.section} key={n.id}>
        <NeedRow need={n} />
        <View style={s.between}>
          <Text style={s.mini}>{n.priority === 'essential' ? '● Kebutuhan wajib' : '○ Jadwal fleksibel'}</Text>
          <AnimatedPressable onPress={() => {setEditingNeed(n); setRescheduleDate(n.dueDate); setAllocatedInput(String(n.saved)); setFormError('');}} scaleTo={0.93}>
            <Text style={s.actionLabel}>Atur rencana ↗</Text>
          </AnimatedPressable>
        </View>
      </View>
    ))}
    {!activeNeeds.filter(n => needFilter === 'all' || n.kind === needFilter).length && (
      <View style={s.section}>
        <Empty text="Belum ada kebutuhan di sini. Mulai dari satu yang paling dekat." />
        <Button title="Tambah kebutuhan" onPress={() => open('need')} icon="plus" />
      </View>
    )}
    <Text style={[s.muted, {textAlign: 'center'}]}>Dana dialokasikan tetap bagian dari saldo.{`\n`}Bayar kebutuhan hanya dihitung sekali.</Text>
  </>;
  const monthStart = new Date(`${selectedDay.slice(0, 7)}-01T12:00:00+07:00`);
  const monthDays = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const monthDates = Array.from({length: monthDays}, (_, i) => `${selectedDay.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`);
  const selectedAttendance = state.attendance.find(a => a.date === selectedDay);
  const selectedHoliday = getHoliday(selectedDay);
  const selectedWorkday = isWorkday(state, selectedDay);
  const calendarScreen = <><View><Text style={s.mini}>RITME KERJA, RITME UANG</Text><Text style={[s.title, {fontSize: 33}]}>Kalender kerja</Text></View><View style={s.section}><View style={s.between}><AnimatedPressable accessibilityRole="button" accessibilityLabel="Bulan sebelumnya" onPress={() => setSelectedDay(addDays(selectedDay.slice(0, 7) + '-01', -1))} scaleTo={0.88}><Icon name="chevron-left" /></AnimatedPressable><Text style={s.heading}>{monthStart.toLocaleDateString('id-ID', {month: 'long', year: 'numeric'})}</Text><AnimatedPressable accessibilityRole="button" accessibilityLabel="Bulan berikutnya" onPress={() => setSelectedDay(addDays(selectedDay.slice(0, 7) + '-01', monthDays))} scaleTo={0.88}><Icon name="chevron-right" /></AnimatedPressable></View><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: '1.75%'}}>{weekdays.map(day => <View key={day} style={[s.day, {height: 24}]}><Text style={s.mini}>{day}</Text></View>)}{Array.from({length: monthStart.getDay()}, (_, i) => <View key={`blank-${i}`} style={s.day} />)}{monthDates.map(date => {const a = state.attendance.find(a => a.date === date), work = isWorkday(state, date), hol = getHoliday(date); return <AnimatedPressable key={date} accessibilityRole="button" accessibilityLabel={`${shortDate(date)}, ${hol ? hol + ', ' : ''}${a?.status ?? (work ? 'jadwal kerja' : 'libur')}`} onPress={() => setSelectedDay(date)} scaleTo={0.9} style={[s.day, date === selectedDay ? {backgroundColor: c.ink} : date === today ? {backgroundColor: c.lime} : hol ? {backgroundColor: '#FDF0EE', borderWidth: 1, borderColor: '#F5C2BC'} : !work || a?.status === 'holiday' ? {backgroundColor: '#F4F6F0'} : {}]}><Text style={[s.body, date === selectedDay && {color: c.lime}, hol && date !== selectedDay && {color: '#C93B2B', fontWeight: 'bold'}, !work && !hol && date !== selectedDay && {color: c.muted}]}>{Number(date.slice(-2))}</Text>{a ? <View style={{width: 4, height: 4, marginTop: 3, borderRadius: 2, backgroundColor: a.status === 'absent' ? '#D98B66' : c.lime}} /> : hol ? <View style={{width: 4, height: 4, marginTop: 3, borderRadius: 2, backgroundColor: '#E86555'}} /> : null}</AnimatedPressable>;})}</View><Text style={s.mini}>● Hijau: tercatat  ·  ● Merah: tgl merah  ·  ● Oranye: tidak masuk  ·  Abu: libur</Text></View>
    <View style={s.section}><SectionHead title={shortDate(selectedDay)} /><Text style={s.body}>{selectedAttendance?.planned ? 'Rencana kehadiran · belum dikonfirmasi' : selectedAttendance ? ({present: 'Sudah masuk kerja', absent: 'Tidak masuk', holiday: 'Libur terjadwal', half: 'Setengah hari'}[selectedAttendance.status]) : selectedHoliday ? `Tanggal Merah: ${selectedHoliday}` : selectedWorkday ? 'Jadwal kerja · belum dicatat' : 'Hari libur · pemasukan diprediksi Rp0'}</Text><Text style={s.muted}>Pemasukan kerja: {currency(selectedAttendance?.income ?? (selectedWorkday ? state.profile.dailyIncome : 0))}</Text><Button title={selectedAttendance?.planned ? 'Konfirmasi kehadiran aktual' : selectedAttendance ? 'Ubah kehadiran' : 'Catat kehadiran'} onPress={() => open('attendance')} icon="check-circle" />{activeNeeds.filter(n => n.dueDate === selectedDay).map(n => <NeedRow key={n.id} need={n} compact />)}</View>
    <Notice title="Kalau hari ini nggak masuk?" text={selectedDay < today ? 'Simulasi hanya untuk hari ini dan hari mendatang. Ubah catatan kehadiran untuk memperbaiki realisasi sebelumnya.' : !selectedWorkday ? 'Tanggal ini sudah dihitung sebagai libur. Tidak ada pemasukan kerja yang dikurangi.' : `Prediksi kekurangan menjadi ${currency(absence.shortfall)}${absence.shortfall > projection.shortfall ? `, bertambah ${currency(absence.shortfall - projection.shortfall)}` : ''}. Lihat dampak sebelum mencatat.`} icon="activity" />
    <Button title="Atur hari kerja & pemasukan" secondary onPress={() => open('setup')} icon="sliders" />
  </>;
  const expenseTotal = state.transactions.filter(t => t.type === 'expense' && t.date <= today).reduce((sum, t) => sum + t.amount, 0);
  const incomeTotal = state.transactions.filter(t => t.type === 'income' && t.date <= today).reduce((sum, t) => sum + t.amount, 0);
  const bars = projection.days.filter((_, i) => i % Math.max(1, Math.floor(period / 7)) === 0).slice(0, 7);
  const maxBar = Math.max(1, ...bars.map(d => Math.abs(d.balance)));
  const insightsScreen = <><View style={s.between}><AnimatedPressable onPress={() => switchTab('home')} accessibilityLabel="Kembali ke beranda" style={s.circle} scaleTo={0.9}><Icon name="arrow-left" /></AnimatedPressable><Text style={s.title}>Statistik</Text><AnimatedPressable onPress={() => open('settings')} accessibilityLabel="Pengaturan" style={s.circle} scaleTo={0.9}><Icon name="more-horizontal" /></AnimatedPressable></View><View style={s.between}>{[{n: 7, label: '7 hari'}, {n: 14, label: '14 hari'}, {n: 30, label: '30 hari'}, {n: 90, label: '90 hari'}].map(p => <Chip key={p.n} label={p.label} active={period === p.n} onPress={() => setPeriod(p.n)} />)}</View><View style={[s.row, {gap: 12}]}><View style={s.stat}><View style={s.between}><Text style={s.mini}>↗ Pemasukan aktual</Text><Icon name="more-horizontal" size={17} /></View><Text style={s.number}>{currency(incomeTotal)}</Text><Text style={s.mini}>Total yang sudah dicatat</Text><View style={[s.progress, {marginTop: 13, backgroundColor: '#DBF2A0'}]}><View style={[s.progressFill, {width: `${incomeTotal ? Math.max(0, Math.min(100, (incomeTotal - expenseTotal) / incomeTotal * 100)) : 0}%`, backgroundColor: c.white}]} /></View></View><View style={[s.stat, {backgroundColor: c.ink}]}><View style={s.between}><Text style={[s.mini, {color: '#D0DBC2'}]}>↗ Pengeluaran aktual</Text><Icon name="more-horizontal" size={17} color={c.lime} /></View><Text style={[s.number, {color: c.white}]}>{currency(expenseTotal)}</Text><Svg width="100%" height="58" viewBox="0 0 150 58"><Path d="M10 45 L38 15 L65 37 L98 8 L137 40 L10 45 M38 15 L98 8 L65 37 L137 40 M10 45 L98 8" fill="none" stroke={c.lime} strokeWidth=".8" /></Svg></View></View><View style={s.section}><PanelNotch /><SectionHead title="Arah saldo kamu" /><View style={s.between}><View><Text style={s.mini}>Prediksi saldo akhir</Text><Text style={s.number}>{currency(projection.projectedBalance)}</Text></View><View style={{gap: 5}}><Text style={s.mini}>■ Hijau: tersedia</Text><Text style={s.mini}>■ Gelap: defisit</Text></View></View><View style={{height: 171, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', borderBottomWidth: 1, borderColor: c.line}}>{bars.map(d => <View key={d.date} style={{alignItems: 'center', width: '12%', justifyContent: 'flex-end', height: '100%'}}><View style={{height: Math.max(8, Math.abs(d.balance) / maxBar * 126), width: 21, backgroundColor: d.balance < 0 ? c.ink : c.lime, borderRadius: 3, overflow: 'hidden'}}>{Array.from({length: 8}, (_, i) => <View key={i} style={{position: 'absolute', height: 3, backgroundColor: c.white, width: '100%', bottom: i * 18}} />)}</View><Text style={[s.mini, {fontSize: 9, marginTop: 10, marginBottom: 8}]}>{shortDate(d.date)}</Text></View>)}</View><Text style={s.muted}>Perkiraan {period} hari, mengikuti jadwal kerja, kebutuhan, dan anggaran harianmu. Bukan pemasukan yang sudah diterima.</Text></View>
    {projection.risks.map((r, i) => <Notice key={`${r.needId}-${i}`} title={`${r.title} · ${shortDate(r.date)}`} text={`Diprediksi kurang ${currency(r.shortfall)}. Tinjau pengeluaran dan hari kerja yang tersisa.`} icon="alert-circle" />)}
    <View style={s.section}><SectionHead title="Semua transaksi" />{transactions.length ? transactions.map(t => <View key={t.id} style={[s.between, {paddingVertical: 7, gap: 15}]}><View style={{flex: 1}}><Text style={s.listTitle}>{t.title}</Text><Text style={s.mini}>{shortDate(t.date)} · {t.category}</Text></View><Text style={s.amount}>{t.type === 'income' ? '+' : '−'}{currency(t.amount)}</Text></View>) : <Empty text="Belum ada transaksi yang dicatat." />}</View>
  </>;

  return <View style={s.screen}>{started ? <SafeAreaView style={s.fill} edges={['top', 'left', 'right']}><Grid /><ScrollView contentContainerStyle={[s.content, {paddingBottom: 110 + insets.bottom}]} showsVerticalScrollIndicator={false}>{storageError && <Notice title="Periksa penyimpanan" text={storageError} icon="alert-circle" />}<Animated.View style={{gap: 16, opacity: tabAnim, transform: [{translateY: tabAnim.interpolate({inputRange: [0, 1], outputRange: [12, 0]})}]}}>{tab === 'home' ? home : tab === 'needs' ? needsScreen : tab === 'calendar' ? calendarScreen : insightsScreen}</Animated.View></ScrollView><View style={[s.navWrap, {bottom: Math.max(insets.bottom, 16)}]}><View style={s.nav}>{([{key: 'home', icon: 'home', label: 'Beranda'}, {key: 'needs', icon: 'layers', label: 'Kebutuhan'}, {key: 'plus', icon: 'plus', label: 'Tambah transaksi'}, {key: 'calendar', icon: 'calendar', label: 'Kalender'}, {key: 'insights', icon: 'bar-chart-2', label: 'Statistik'}] as const).map(item => <AnimatedPressable key={item.key} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{selected: tab === item.key}} onPress={() => item.key === 'plus' ? open('expense') : switchTab(item.key)} style={item.key === 'plus' ? s.navPlus : [s.navItem, tab === item.key && {backgroundColor: '#363C30'}]} scaleTo={item.key === 'plus' ? 0.86 : 0.9}><Icon name={item.icon} color={item.key === 'plus' ? c.ink : tab === item.key ? c.lime : '#B3BAA9'} size={21} /></AnimatedPressable>)}</View></View></SafeAreaView> : welcome}
    <Modal visible={sheet !== null} transparent animationType="slide" statusBarTranslucent onRequestClose={() => { if (keyboardHeight > 0) Keyboard.dismiss(); else setSheet(null); }}><View style={[s.modalBackdrop, keyboardHeight > 0 && {justifyContent: 'flex-end', paddingBottom: keyboardHeight}]}><Pressable style={StyleSheet.absoluteFill} onPress={() => { if (keyboardHeight > 0) Keyboard.dismiss(); else setSheet(null); }} /><View style={[s.modal, {paddingBottom: keyboardHeight > 0 ? 16 : Math.max(insets.bottom, 22), maxHeight: keyboardHeight > 0 ? Math.max(280, windowHeight - keyboardHeight - (insets.top || 24) - 16) : '91%'}]}><View style={[s.between, {marginBottom: 13}]}><Text style={s.title}>{{expense: 'Catat pengeluaran', income: 'Catat pemasukan', need: 'Bikin rencana baru', attendance: 'Kehadiran kerja', settings: 'Ruang pribadi', setup: 'Kenalan dulu, yuk.', cloud: 'Sinkron perangkat', backup: 'Pulihkan cadangan'}[sheet ?? 'expense']}</Text><AnimatedPressable accessibilityLabel="Tutup" onPress={() => setSheet(null)} style={s.circle} scaleTo={0.88}><Icon name="x" /></AnimatedPressable></View><ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom: 28}}>
      {(sheet === 'expense' || sheet === 'income' || sheet === 'need') && <>
        {sheet !== 'need' && <View style={[s.row, {gap: 8}]}><Chip label="Uang keluar" active={sheet === 'expense'} onPress={() => setSheet('expense')} /><Chip label="Uang masuk" active={sheet === 'income'} onPress={() => setSheet('income')} /></View>}
        {sheet === 'income' && <Text style={[s.muted, {marginTop: 10}]}>{state.profile.payrollCycle === 'monthly' ? "Pemasukan kerja dicatat dari absensi. Jika mencatat gaji yang sudah cair, sertakan kata ‘gaji’ di namanya agar prediksi tidak menghitung dua kali." : 'Pemasukan kerja dicatat otomatis dari absensi. Gunakan ini untuk pemasukan lain.'}</Text>}
        <Field label={sheet === 'need' ? 'NAMA KEBUTUHAN' : 'UNTUK APA?'} value={form.title} onChange={title => setForm({...form, title})} placeholder={sheet === 'need' ? 'Misal: bensin motor' : 'Misal: makan siang'} />
        <Field label="NOMINAL (RP)" value={form.amount} onChange={amount => setForm({...form, amount})} placeholder="25000" numeric />
        <Field label={sheet === 'need' ? 'TANGGAL DIBUTUHKAN (YYYY-MM-DD)' : 'TANGGAL (YYYY-MM-DD)'} value={form.date} onChange={date => setForm({...form, date})} />
        {sheet !== 'need' && <View style={[s.row, {gap: 7, marginTop: 7, marginBottom: 3}]}><Chip label="Hari ini" active={form.date === today} onPress={() => setForm({...form, date: today})} /><Chip label="Kemarin" active={form.date === addDays(today, -1)} onPress={() => setForm({...form, date: addDays(today, -1)})} /><Chip label="2 hari lalu" active={form.date === addDays(today, -2)} onPress={() => setForm({...form, date: addDays(today, -2)})} /></View>}
        {sheet === 'expense' && <><Text style={[s.fieldLabel, {marginTop: 17, marginBottom: 10}]}>KATEGORI</Text><View style={[s.row, {flexWrap: 'wrap', gap: 7}]}>{['Makan', 'Transportasi', 'Belanja', 'Mendadak', 'Lainnya'].map(category => <Chip key={category} label={category} active={form.category === category} onPress={() => setForm({...form, category})} />)}</View></>}
        {sheet === 'need' && <><Text style={[s.fieldLabel, {marginTop: 17, marginBottom: 10}]}>JENIS KEBUTUHAN</Text><View style={[s.row, {gap: 7}]}>{[{key: 'recurring', label: 'Rutin'}, {key: 'debt', label: 'Utang'}, {key: 'goal', label: 'Tujuan'}].map(k => <Chip key={k.key} label={k.label} active={form.kind === k.key} onPress={() => setForm({...form, kind: k.key})} />)}</View>{form.kind === 'recurring' && <Field label="BERULANG SETIAP (HARI KALENDER)" value={form.interval} onChange={interval => setForm({...form, interval})} numeric />}<Field label="SUDAH DIALOKASIKAN DARI SALDO (RP)" value={form.saved} onChange={saved => setForm({...form, saved})} numeric /><Text style={[s.muted, {marginTop: 5}]}>Alokasi ini bagian dari saldo yang ada, bukan pemasukan tambahan.</Text><View style={[s.row, {gap: 7, marginTop: 15}]}><Chip label="Wajib" active={form.priority === 'essential'} onPress={() => setForm({...form, priority: 'essential'})} /><Chip label="Fleksibel" active={form.priority === 'flexible'} onPress={() => setForm({...form, priority: 'flexible'})} /></View></>}
        {formError && <Text style={s.error}>{formError}</Text>}<View style={{marginTop: 23}}><Button title={sheet === 'need' ? 'Simpan rencana' : 'Simpan transaksi'} onPress={saveForm} icon="check" /></View>
      </>}
      {sheet === 'setup' && <><Text style={s.muted}>DanaSiap menghitung tabungan hanya di hari kamu kerja. Semua nominal dalam rupiah.</Text>
        <View style={[s.row, {gap: 13, alignItems: 'center', marginTop: 14, marginBottom: 4}]}>
          <View style={[s.avatar, {width: 48, height: 48, borderRadius: 24, overflow: 'hidden'}]}>
            {profile.avatarUrl ? <Image source={{uri: profile.avatarUrl}} style={{width: 48, height: 48}} /> : <Text style={[s.avatarText, {fontSize: 22}]}>{(profile.name || 'D').slice(0, 1).toUpperCase()}</Text>}
          </View>
          <View style={[s.row, {gap: 8, flex: 1}]}>
            <View style={{flex: 1}}><Button title={profile.avatarUrl ? 'Ganti foto' : 'Pilih foto'} secondary icon="camera" onPress={pickAvatar} /></View>
            {Boolean(profile.avatarUrl) && <View style={{flex: 1}}><Button title="Hapus foto" secondary icon="trash-2" onPress={removeAvatar} /></View>}
          </View>
        </View>
        <Field label="NAMA PANGGILAN" value={profile.name} onChange={name => setProfile({...profile, name})} placeholder="Nama kamu" /><Field label="SALDO AWAL (RP)" value={profile.openingBalance} onChange={openingBalance => setProfile({...profile, openingBalance})} placeholder="Saldo sebelum transaksi yang dicatat" numeric /><Field label={profile.payrollCycle === 'monthly' ? "UPAH POKOK / HARI KERJA (RP)" : "PEMASUKAN PER HARI KERJA (RP)"} value={profile.dailyIncome} onChange={dailyIncome => setProfile({...profile, dailyIncome})} placeholder="70000" numeric /><Text style={[s.fieldLabel, {marginTop: 15, marginBottom: 8}]}>SISTEM PENERIMAAN GAJI</Text><View style={[s.row, {gap: 8}]}><Chip label="Harian" active={profile.payrollCycle === 'daily'} onPress={() => setProfile({...profile, payrollCycle: 'daily'})} /><Chip label="Bulanan (Payroll)" active={profile.payrollCycle === 'monthly'} onPress={() => setProfile({...profile, payrollCycle: 'monthly'})} /></View>{profile.payrollCycle === 'monthly' && <Field label="TANGGAL GAJIAN BULANAN (1-28)" value={profile.payday} onChange={payday => setProfile({...profile, payday})} placeholder="5" numeric />}<Field label="TUNJANGAN AKTIVITAS (UANG SAKU CASH / HARI AKTIF)" value={profile.activityAllowance} onChange={activityAllowance => setProfile({...profile, activityAllowance})} placeholder="0" numeric /><Text style={[s.muted, {marginTop: 4}]}>Diberikan cash langsung di tangan pada hari aktif. Libur = Rp 0.</Text><Field label="ANGGARAN HARIAN RUTIN (RP) — OPSIONAL" value={profile.dailyBudget} onChange={dailyBudget => setProfile({...profile, dailyBudget})} placeholder="0" numeric /><Text style={[s.muted, {marginTop: 6}]}>Boleh isi 0 jika pengeluaran harian fleksibel/dadakan. Cukup dicatat langsung saat jajan/makan. Kebutuhan berkala (ganti oli, kuota, dll.) dicatat di Rencana Kebutuhan.</Text><Text style={[s.fieldLabel, {marginTop: 19, marginBottom: 10}]}>BIASANYA KERJA HARI APA?</Text><View style={[s.row, {flexWrap: 'wrap', gap: 6}]}>{weekdays.map((day, i) => <Chip key={day} label={day} active={profile.workDays.includes(i)} onPress={() => setProfile({...profile, workDays: profile.workDays.includes(i) ? profile.workDays.filter(d => d !== i) : [...profile.workDays, i]})} />)}</View><Text style={[s.muted, {marginTop: 10}]}>Tanggal merah mengikuti pilihanmu. Tandai libur tambahan lewat kalender.</Text>{formError && <Text style={s.error}>{formError}</Text>}<View style={{marginTop: 23}}><Button title={started ? 'Simpan pengaturan' : 'Siap, mulai rencanakan'} onPress={saveProfile} icon="arrow-up-right" /></View></>}
      {sheet === 'attendance' && <>
        <Text style={s.muted}>{shortDate(selectedDay)} · kehadiran dapat dikoreksi tanpa menggandakan pemasukan.</Text>
        <View style={{gap: 10, marginTop: 16}}>
          {([{key: 'present', label: 'Masuk kerja'}, {key: 'absent', label: 'Tidak masuk'}, {key: 'half', label: 'Setengah hari'}, {key: 'holiday', label: 'Libur terjadwal'}] as const).map(option => (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{selected: attStatus === option.key}}
              key={option.key}
              onPress={() => {
                setAttStatus(option.key);
                if (option.key === 'half') {
                  setAttDeductionPct(0);
                  setAttIncome(formatThousands(state.profile.dailyIncome));
                  setAttAllowancePct(100);
                  setAttAllowance(formatThousands(state.profile.activityAllowance ?? 0));
                } else if (option.key === 'present') {
                  setAttIncome(formatThousands(state.profile.dailyIncome));
                } else {
                  setAttIncome('0');
                }
              }}
              style={[s.between, {padding: 15, backgroundColor: attStatus === option.key ? c.lime : c.white, borderRadius: 14}]}
              scaleTo={0.97}
            >
              <Text style={s.body}>{option.label}</Text>
              <Icon name={attStatus === option.key ? 'check-circle' : 'circle'} size={18} />
            </AnimatedPressable>
          ))}
        </View>
        {(attStatus === 'present' || attStatus === 'half') && (
          <Field
            label={attStatus === 'half' ? "UPAH YANG DITERIMA HARI INI (RP)" : "PEMASUKAN AKTUAL (RP) — BOLEH TERMASUK LEMBUR"}
            value={attIncome}
            onChange={val => {
              setAttIncome(val);
              setAttDeductionPct(-1);
            }}
            numeric
          />
        )}
        {attStatus === 'half' && (
          <View style={{marginTop: 12, gap: 8}}>
            <Text style={s.fieldLabel}>PILIHAN POTONGAN GAJI SETENGAH HARI</Text>
            <View style={[s.row, {flexWrap: 'wrap', gap: 6}]}>
              <Chip
                label={`100% Utuh (${currency(state.profile.dailyIncome)})`}
                active={attDeductionPct === 0}
                onPress={() => {
                  setAttDeductionPct(0);
                  setAttIncome(formatThousands(state.profile.dailyIncome));
                }}
              />
              <Chip
                label={`Dapat 75% (${currency(Math.floor(state.profile.dailyIncome * 0.75))})`}
                active={attDeductionPct === 25}
                onPress={() => {
                  setAttDeductionPct(25);
                  setAttIncome(formatThousands(Math.floor(state.profile.dailyIncome * 0.75)));
                }}
              />
              <Chip
                label={`Dapat 50% (${currency(Math.floor(state.profile.dailyIncome * 0.5))})`}
                active={attDeductionPct === 50}
                onPress={() => {
                  setAttDeductionPct(50);
                  setAttIncome(formatThousands(Math.floor(state.profile.dailyIncome * 0.5)));
                }}
              />
              <Chip
                label={`Dapat 25% (${currency(Math.floor(state.profile.dailyIncome * 0.25))})`}
                active={attDeductionPct === 75}
                onPress={() => {
                  setAttDeductionPct(75);
                  setAttIncome(formatThousands(Math.floor(state.profile.dailyIncome * 0.25)));
                }}
              />
            </View>
            <Text style={s.muted}>Atau ketik nominal rupiah bebas di atas.</Text>
          </View>
        )}
        {attStatus === 'half' && Boolean(state.profile.activityAllowance) && (
          <View style={{marginTop: 14, gap: 8}}>
            <Field
              label="UANG SAKU CASH DITERIMA (RP)"
              value={attAllowance}
              onChange={val => {
                setAttAllowance(val);
                setAttAllowancePct(-1);
              }}
              numeric
            />
            <Text style={s.fieldLabel}>PILIHAN CEPAT PERSENTASE</Text>
            <View style={[s.row, {flexWrap: 'wrap', gap: 6}]}>
              <Chip
                label={`100% Full (${currency(state.profile.activityAllowance ?? 0)})`}
                active={attAllowancePct === 100}
                onPress={() => {
                  setAttAllowancePct(100);
                  setAttAllowance(formatThousands(state.profile.activityAllowance ?? 0));
                }}
              />
              <Chip
                label={`75% (${currency(Math.floor((state.profile.activityAllowance ?? 0) * 0.75))})`}
                active={attAllowancePct === 75}
                onPress={() => {
                  setAttAllowancePct(75);
                  setAttAllowance(formatThousands(Math.floor((state.profile.activityAllowance ?? 0) * 0.75)));
                }}
              />
              <Chip
                label={`50% (${currency(Math.floor((state.profile.activityAllowance ?? 0) * 0.5))})`}
                active={attAllowancePct === 50}
                onPress={() => {
                  setAttAllowancePct(50);
                  setAttAllowance(formatThousands(Math.floor((state.profile.activityAllowance ?? 0) * 0.5)));
                }}
              />
              <Chip
                label={`25% (${currency(Math.floor((state.profile.activityAllowance ?? 0) * 0.25))})`}
                active={attAllowancePct === 25}
                onPress={() => {
                  setAttAllowancePct(25);
                  setAttAllowance(formatThousands(Math.floor((state.profile.activityAllowance ?? 0) * 0.25)));
                }}
              />
              <Chip
                label="0% (Rp 0)"
                active={attAllowancePct === 0}
                onPress={() => {
                  setAttAllowancePct(0);
                  setAttAllowance('0');
                }}
              />
            </View>
            <Text style={s.muted}>Atau ketik nominal rupiah bebas di atas.</Text>
          </View>
        )}
        {selectedDay > today && (
          <Text style={[s.muted, {marginTop: 12}]}>Tanggal mendatang adalah rencana kehadiran. Pemasukan belum dianggap sebagai uang yang sudah diterima.</Text>
        )}
        {(attStatus === 'absent' || attStatus === 'holiday') && (
          <View style={{marginTop: 16}}>
            <Notice
              title="Dampak pada rencana"
              text={`${selectedWorkday ? `Prediksi kekurangan: ${currency(absence.shortfall)}. ` : 'Hari ini sudah diprediksi tanpa pemasukan. '}Kebutuhan rutin dan pengeluaran tetap dihitung.`}
            />
          </View>
        )}
        {formError && <Text style={s.error}>{formError}</Text>}
        <View style={{marginTop: 23}}>
          <Button title="Simpan kehadiran" onPress={recordAttendance} icon="check" />
        </View>
      </>}
      {sheet === 'settings' && <View style={{gap: 14}}>
        <View style={[s.row, {gap: 13, paddingVertical: 10}]}>
          <View style={[s.avatar, {width: 52, height: 52, borderRadius: 26, overflow: 'hidden'}]}>
            {state.profile.avatarUrl ? <Image source={{uri: state.profile.avatarUrl}} style={{width: 52, height: 52}} /> : <Text style={[s.avatarText, {fontSize: 26}]}>{state.profile.name.slice(0, 1).toUpperCase() || 'D'}</Text>}
          </View>
          <View style={{flex: 1}}>
            <Text style={s.heading}>{state.profile.name || 'Pengguna'}</Text>
            <Text style={s.muted}>{demo ? 'Mode data contoh' : 'Data pribadi · tersimpan di perangkat'}</Text>
          </View>
        </View>
        <View style={[s.row, {gap: 8}]}>
          <View style={{flex: 1}}>
            <Button title={state.profile.avatarUrl ? 'Ganti foto profil' : 'Unggah foto profil'} secondary icon="camera" onPress={pickAvatar} />
          </View>
          {Boolean(state.profile.avatarUrl) && <View style={{flex: 1}}><Button title="Hapus foto" secondary icon="trash-2" onPress={removeAvatar} /></View>}
        </View>
        <Button title="Profil, pemasukan & hari kerja" secondary icon="sliders" onPress={() => open('setup')} />
        <Button title={reminders ? 'Matikan pengingat perangkat' : 'Aktifkan pengingat kebutuhan'} secondary icon="bell" disabled={demo} onPress={async () => {if (reminders) {setReminders(false); persist(state, demo, false);} else {try {const granted = await enableReminders(); if (granted) {setReminders(true); persist(state, demo, true);} else Alert.alert('Izin notifikasi belum aktif', 'Aktifkan notifikasi DanaSiap di pengaturan Android.');} catch {Alert.alert('Pengingat belum aktif', 'Coba lagi setelah membuka pengaturan notifikasi Android.');}}}} />
        <Text style={s.muted}>{demo ? 'Pengingat dinonaktifkan pada data contoh.' : 'Pengingat untuk 20 kebutuhan aktif dan 7 hari kerja ke depan. Buka aplikasi berkala agar jadwal diperbarui.'}</Text>
        <Button title="Akun & sinkron web" secondary icon="cloud" onPress={() => open('cloud')} />
        <Button title="Salin cadangan ke clipboard" secondary icon="copy" onPress={copyBackupToClipboard} />
        <Button title="Bagikan cadangan JSON" secondary icon="share-2" onPress={shareBackupJson} />
        <Button title="Pulihkan cadangan" secondary icon="upload" onPress={() => {setBackupText(''); setBackupPreview(null); open('backup');}} />
        {demo && <Button title="Mulai dengan data pribadi" icon="arrow-up-right" onPress={() => Alert.alert('Mulai data pribadi?', 'Data contoh akan diganti dengan rencana kosong.', [{text: 'Batal', style: 'cancel'}, {text: 'Mulai', onPress: () => {const fresh = defaultState(today); setDemo(false); persist(fresh, false, false); setProfile({name: '', dailyIncome: '', dailyBudget: '', openingBalance: '', workDays: [1, 2, 3, 4, 5, 6], activityAllowance: '', payrollCycle: 'daily', payday: '5', avatarUrl: undefined}); setSheet('setup'); setTab('home');}}])} />}
        <Text style={[s.muted, {textAlign: 'center', marginTop: 10}]}>DanaSiap 1.0 · Rupiah · Asia/Jakarta{`\n`}Angka prediksi mengikuti data yang kamu masukkan.</Text>
      </View>}
      {sheet === 'backup' && <View style={{gap: 14}}>
        <Text style={s.muted}>Pulihkan data dari cadangan JSON DanaSiap. Kamu bisa langsung menempel dari clipboard perangkat atau mengetik manual.</Text>
        <Button
          title="Tempel dari clipboard"
          icon="clipboard"
          onPress={async () => {
            try {
              const clip = await Clipboard.getStringAsync();
              if (!clip || !clip.trim()) {
                setFormError('Clipboard kosong. Salin teks cadangan JSON terlebih dahulu.');
                return;
              }
              const clean = clip.trim();
              setBackupText(clean);
              setFormError('');
              try {
                const parsed = JSON.parse(clean);
                const targetState = parsed.state ?? parsed.data ?? parsed;
                const valid = validateState(targetState);
                setBackupPreview({
                  name: valid.profile.name || 'Pengguna',
                  txCount: valid.transactions.length,
                  needsCount: valid.needs.length,
                  validState: valid,
                });
              } catch {
                setBackupPreview(null);
                setFormError('Format cadangan JSON tidak valid.');
              }
            } catch {
              setFormError('Gagal membaca clipboard perangkat.');
            }
          }}
        />
        {backupPreview && (
          <View style={[s.notice, {backgroundColor: '#EAF7D7', borderColor: c.lime, borderWidth: 1}]}>
            <Icon name="check-circle" color={c.ink} size={20} />
            <View style={{flex: 1}}>
              <Text style={s.noticeTitle}>Cadangan valid terverifikasi</Text>
              <Text style={s.muted}>Profil: {backupPreview.name} · {backupPreview.txCount} transaksi · {backupPreview.needsCount} rencana kebutuhan</Text>
            </View>
          </View>
        )}
        <Field
          label="ISI CADANGAN JSON"
          value={backupText}
          onChange={text => {
            setBackupText(text);
            if (!text.trim()) {
              setBackupPreview(null);
              setFormError('');
              return;
            }
            try {
              const parsed = JSON.parse(text);
              const targetState = parsed.state ?? parsed.data ?? parsed;
              const valid = validateState(targetState);
              setBackupPreview({
                name: valid.profile.name || 'Pengguna',
                txCount: valid.transactions.length,
                needsCount: valid.needs.length,
                validState: valid,
              });
              setFormError('');
            } catch {
              setBackupPreview(null);
            }
          }}
          placeholder="Tempel teks JSON di sini..."
          multiline
        />
        {formError && <Text style={s.error}>{formError}</Text>}
        <View style={{marginTop: 6}}>
          <Button
            title="Pulihkan sekarang"
            icon="check"
            disabled={!backupText.trim()}
            onPress={() => {
              try {
                if (backupText.length > 5_000_000) throw new Error('Ukuran cadangan melebihi batas 5 MB.');
                const parsed = JSON.parse(backupText);
                if (parsed.version !== undefined && parsed.version !== 1) throw new Error('Versi cadangan belum didukung.');
                const next = backupPreview?.validState ?? validateState(parsed.state ?? parsed.data ?? parsed);
                Alert.alert(
                  'Pulihkan cadangan?',
                  `Profil: ${next.profile.name || 'Pengguna'}. ${next.transactions.length} transaksi, ${next.needs.length} kebutuhan. Data perangkat ini akan diganti.`,
                  [
                    {text: 'Batal', style: 'cancel'},
                    {
                      text: 'Pulihkan',
                      onPress: () => {
                        setDemo(false);
                        persist(next, false);
                        setSheet(null);
                        Alert.alert('Berhasil', 'Data cadangan telah dipulihkan!');
                      },
                    },
                  ]
                );
              } catch {
                setFormError('Cadangan tidak valid. Gunakan berkas JSON dari DanaSiap.');
              }
            }}
          />
        </View>
      </View>}
      {sheet === 'cloud' && <>
        {!cloudConfigured ? (
          <View style={{marginTop: 10}}>
            <Notice title="Cloud belum dikonfigurasi" text="Aplikasi tetap bisa digunakan offline. Sinkron akun akan tersedia pada build yang sudah terhubung ke server DanaSiap." icon="cloud-off" />
          </View>
        ) : cloudUser ? (
          <View style={{gap: 13, marginTop: 8}}>
            <View style={[s.notice, {backgroundColor: c.lime + '33', borderColor: c.lime}]}>
              <Icon name="shield" size={18} />
              <View style={{flex: 1}}>
                <Text style={s.noticeTitle}>Terhubung ke cloud</Text>
                <Text style={[s.muted, {color: '#63744F'}]}>{cloudUser}</Text>
              </View>
            </View>
            <Text style={[s.muted, {marginBottom: 4}]}>Pilih unggah atau ambil data. Perubahan tidak tersinkron otomatis agar kamu tetap punya kendali.</Text>
            <Button title="Unggah data perangkat" disabled={busy || demo} icon="upload-cloud" onPress={() => runCloud(upload)} />
            <Button title="Ambil data dari cloud" disabled={busy} icon="download-cloud" secondary onPress={() => runCloud(download)} />
            <View style={{height: 1, backgroundColor: '#E3E9DA', marginVertical: 8}} />
            <Button title="Keluar dari akun" disabled={busy} secondary icon="log-out" onPress={() => runCloud(async () => { await cloud!.signOut(); setCloudUser(''); })} />
          </View>
        ) : (
          <View style={{gap: 0, marginTop: 8}}>
            <View style={{alignItems: 'center', paddingVertical: 20, gap: 10}}>
              <View style={{width: 56, height: 56, backgroundColor: c.lime, borderRadius: 16, alignItems: 'center', justifyContent: 'center'}}>
                <Icon name="shield" size={26} color={c.ink} />
              </View>
              <Text style={[s.title, {textAlign: 'center', marginTop: 4}]}>Masuk ke DanaSiap</Text>
              <Text style={[s.muted, {textAlign: 'center', maxWidth: 260}]}>Catatan Android dan web tersinkron lewat akun yang sama.</Text>
            </View>
            <Field label="EMAIL" value={cloudEmail} onChange={setCloudEmail} placeholder="nama@email.com" />
            <Field label="PASSWORD" value={cloudPassword} onChange={setCloudPassword} secret />
            <View style={{gap: 10, marginTop: 8}}>
              <Button title="Masuk" disabled={busy} icon="log-in" onPress={() => runCloud(async () => { const session = await cloud!.signIn(cloudEmail.trim(), cloudPassword); setCloudUser(session.user.email ?? cloudEmail); setCloudPassword(''); })} />
              <Button title="Buat akun baru" disabled={busy} secondary icon="user-plus" onPress={() => runCloud(async () => { const result = await cloud!.signUp(cloudEmail.trim(), cloudPassword); setCloudMessage(result.confirmationRequired ? 'Cek email untuk konfirmasi, lalu masuk kembali.' : 'Akun siap digunakan.'); if (result.session) setCloudUser(result.session.user.email ?? cloudEmail); setCloudPassword(''); })} />
            </View>
          </View>
        )}
        {busy && <ActivityIndicator color={c.ink} style={{marginTop: 15}} />}
        {cloudMessage && <Text style={[s.muted, {marginTop: 15, textAlign: 'center'}]}>{cloudMessage}</Text>}
      </>}
    </ScrollView></View></View></Modal>
    <Modal visible={editingNeed !== null} transparent animationType="slide" statusBarTranslucent onRequestClose={() => { if (keyboardHeight > 0) Keyboard.dismiss(); else setEditingNeed(null); }}><View style={[s.modalBackdrop, keyboardHeight > 0 && {justifyContent: 'flex-end', paddingBottom: keyboardHeight}]}><Pressable style={StyleSheet.absoluteFill} onPress={() => { if (keyboardHeight > 0) Keyboard.dismiss(); else setEditingNeed(null); }} /><View style={[s.modal, {paddingBottom: keyboardHeight > 0 ? 16 : Math.max(insets.bottom, 22), maxHeight: keyboardHeight > 0 ? Math.max(280, windowHeight - keyboardHeight - (insets.top || 24) - 16) : '91%'}]}><View style={s.between}><Text style={s.title}>{editingNeed?.title}</Text><AnimatedPressable accessibilityLabel="Tutup detail kebutuhan" onPress={() => setEditingNeed(null)} style={s.circle} scaleTo={0.88}><Icon name="x" /></AnimatedPressable></View>{editingNeed && <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom: 28}}><Text style={[s.number, {marginTop: 12}]}>{currency(remainingAmount(editingNeed))}</Text><Text style={s.muted}>Jadwal {shortDate(editingNeed.dueDate)} · alokasi {currency(editingNeed.saved)}</Text><Field label="ALOKASI DARI SALDO (RP)" value={allocatedInput} onChange={setAllocatedInput} numeric /><Field label="JADWAL BARU (YYYY-MM-DD)" value={rescheduleDate} onChange={setRescheduleDate} /><View style={[s.row, {gap: 9, marginTop: 11}]}><Chip label="−1 hari" active={false} onPress={() => {try {setRescheduleDate(addDays(rescheduleDate, -1));} catch {setFormError('Gunakan tanggal YYYY-MM-DD.');}}} /><Chip label="+1 hari" active={false} onPress={() => {try {setRescheduleDate(addDays(rescheduleDate, 1));} catch {setFormError('Gunakan tanggal YYYY-MM-DD.');}}} /><Chip label="+3 hari" active={false} onPress={() => {try {setRescheduleDate(addDays(rescheduleDate, 3));} catch {setFormError('Gunakan tanggal YYYY-MM-DD.');}}} /></View>{formError && <Text style={s.error}>{formError}</Text>}<View style={{gap: 11, marginTop: 22}}><Button title="Simpan & hitung ulang" secondary icon="calendar" onPress={() => {try {const next = reducer(reducer(current.current, {type: 'need/reschedule', id: editingNeed.id, dueDate: rescheduleDate}), {type: 'need/update', id: editingNeed.id, changes: {saved: number(allocatedInput)}}); persist(next); setEditingNeed(null);} catch (error) {setFormError(error instanceof Error ? error.message : 'Periksa alokasi dan tanggal.');}}} /><Button title={editingNeed.kind === 'recurring' ? 'Sudah dipakai / dibayar hari ini' : 'Sudah dibayar hari ini'} icon="check-circle" onPress={() => confirmPay(editingNeed)} /></View><Text style={[s.muted, {marginTop: 12}]}>Jika rutin, jadwal berikutnya dimulai dari pembayaran aktual. Saldo dan prediksi langsung diperbarui.</Text></ScrollView>}</View></View></Modal>
  </View>;
}
