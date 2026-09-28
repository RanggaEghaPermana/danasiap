import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState as NativeAppState, BackHandler, Dimensions, GestureResponderEvent, Image, Keyboard, LayoutChangeEvent, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useFonts, BarlowCondensed_500Medium, BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed';
import { DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import Svg, { Circle, ClipPath, Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { AppState, Attendance, DailyItem, FinancialAction, MAX_ITEM_IMAGE, Need, ShoppingItem, TOKEN_TARIFF, addDays, applyAutomations, balance, calculatePayroll, checkPurchase, currency, dailyTransactionId, defaultState, demoState, electricityEstimate, forecast, gasEstimate, formatThousands, getHoliday, isElectricityNeed, isGasNeed, isNationalHoliday, isScheduled, isShoppingNeed, isWorkday, localDate, migrateDailyBudget, parseThousands, periodBudget, periodHistory, reducer, remainingAmount, shoppingDueDate, shoppingTotal, spendingImpact, validateState } from '@danasiap/core';
import { loadPlan, savePlan } from './storage';
import { DialogHost, showDialog } from './dialog';
import { enableReminders, scheduleReminders } from './notifications';
import { cloud, cloudConfigured } from './cloud';
import * as ImagePicker from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import * as Clipboard from 'expo-clipboard';
import { colors as c, styles as s } from './theme';
import { Appear, BlurLayer, Collapse, BlurTarget, CrossBlur, FadeBg, FlyLayer, Marquee, PopIn, PressScale, RollingValue, SegmentPills, SheetModal, StaggerList, T, Veiled, exit, fade, flyChip, isReducedMotion, measure, pointOf, spring, useReducedMotion, useVeil } from './motion';


type IconName = React.ComponentProps<typeof Feather>['name'];
type Tab = 'home' | 'needs' | 'calendar' | 'insights';
type Sheet = 'expense' | 'income' | 'need' | 'attendance' | 'settings' | 'setup' | 'cloud' | 'backup' | 'daily' | 'leftover' | 'check' | 'shopping' | 'token' | 'gas' | 'skip' | null;
type DailyDraft = {id: string; title: string; amount: string; days: number[]; skipHolidays: boolean};
type ShopDraft = {id: string; name: string; qty: string; price: string; skip: boolean; bought: boolean; image?: string};
/** One shopping item or daily item open in its own edit form; `isNew` until it is saved once. */
type ShopForm = ShopDraft & {isNew: boolean};
type DailyForm = DailyDraft & {isNew: boolean};
const shopDraftOf = (item: ShoppingItem): ShopDraft => ({id: item.id, name: item.name, qty: String(item.qty).replace('.', ','), price: formatThousands(item.price), skip: Boolean(item.skip), bought: false, image: item.image});
const weekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const shortDate = (date: string) => new Date(`${date}T12:00:00+07:00`).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta'});
const number = (input: string) => parseThousands(input);
/** Accepts both comma and dot decimals, e.g. quantities or kWh. */
const decimal = (input: string) => {const value = Number(input.trim().replace(/\s/g, '').replace(',', '.')); return input.trim() && Number.isFinite(value) ? value : NaN;};
const GAS_SIZES = [3, 5.5, 12] as const;
const gasSizeText = (size: number) => `${size.toLocaleString('id-ID')} kg`;
/** "45 hari (1,5 bulan)" — months only once a cylinder lasts a month or more. */
const gasDaysText = (days: number) => {const d = Math.round(days); return d >= 30 ? `${d} hari (${(Math.round(d / 30 * 10) / 10).toLocaleString('id-ID', {maximumFractionDigits: 1})} bulan)` : `${d} hari`;};
const kwhText = (value: number) => (Math.round(value * 10) / 10).toLocaleString('id-ID', {maximumFractionDigits: 1});
function Icon({name, size = 19, color = c.ink}: {name: IconName; size?: number; color?: string}) { return <Feather name={name} size={size} color={color} />; }
function Grid({dark = false}: {dark?: boolean}) {
  return <Svg pointerEvents="none" style={{position: 'absolute', top: 0, bottom: 0, left: 0, right: 0}} width="100%" height="100%"><Pattern id="grid" x="0" y="0" width="39" height="39" patternUnits="userSpaceOnUse"><Path d="M 39 0 L 0 0 0 39" fill="none" stroke={dark ? '#49503E' : '#87A454'} strokeOpacity={dark ? .21 : .08} strokeWidth=".8" /></Pattern><Rect width="100%" height="100%" fill="url(#grid)" /></Svg>;
}
function PanelNotch() { return <View pointerEvents="none" style={{position: 'absolute', top: -1, left: '50%', marginLeft: -16, height: 8, width: 32, backgroundColor: c.pale, borderBottomLeftRadius: 20, borderBottomRightRadius: 20}} />; }

/** Every pressable in the app uses the shared press feedback (pattern 5). */
const AnimatedPressable = PressScale;

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
function Button({title, onPress, secondary, disabled, icon}: {title: string; onPress: (event: GestureResponderEvent) => void; secondary?: boolean; disabled?: boolean; icon?: IconName}) {
  return (
    <AnimatedPressable
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled}
      style={[s.button, secondary && s.secondaryButton, disabled && {opacity: .45}]}
    >
      {icon && <Icon name={icon} size={17} color={secondary ? c.ink : c.lime} />}
      <Marquee containerStyle={{flexShrink: 1}} style={[s.buttonText, secondary && {color: c.ink}]}>{title}</Marquee>
    </AnimatedPressable>
  );
}
function Field({label, value, onChange, placeholder, numeric, decimal, secret, multiline}: {label: string; value: string; onChange: (value: string) => void; placeholder?: string; numeric?: boolean; decimal?: boolean; secret?: boolean; multiline?: boolean}) {
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
  return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={numeric ? (value ? formatThousands(value) : '') : value} onChangeText={handleChange} placeholder={placeholder ?? (numeric ? '0' : undefined)} placeholderTextColor="#A0A995" keyboardType={numeric ? 'numeric' : decimal ? 'decimal-pad' : 'default'} autoCapitalize={secret || multiline || label.toLowerCase().includes('email') ? 'none' : 'sentences'} autoCorrect={!multiline && !secret} spellCheck={!multiline && !secret} secureTextEntry={secret} multiline={multiline} style={[s.input, multiline && {height: 120, textAlignVertical: 'top'}]} /></View>;
}
function SectionHead({title, action, onPress}: {title: string; action?: string; onPress?: () => void}) {
  return (
    <View style={s.between}>
      <Text style={s.heading}>{title}</Text>
      {action && (
        <AnimatedPressable accessibilityRole="button" onPress={onPress} hitSlop={12}>
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
      onPress={onPress}
      style={[s.tab, {maxWidth: '100%'}]}
    >
      <FadeBg on={active} color={c.lime} radius={22} />
      <Marquee style={[s.actionLabel, active && {color: c.ink, fontWeight: 'bold'}]}>{label}</Marquee>
    </AnimatedPressable>
  );
}

function TinyButton({label, onPress, danger}: {label: string; onPress: (event: GestureResponderEvent) => void; danger?: boolean}) {
  return <AnimatedPressable accessibilityLabel={label} onPress={onPress} style={[s.tinyButton, {maxWidth: '100%'}]}><Marquee style={[s.actionLabel, danger && {color: c.red}]}>{label}</Marquee></AnimatedPressable>;
}
/** Search box for long lists: magnifier, pale field, clear button that pops in once something is typed. */
function SearchField({value, onChange, placeholder}: {value: string; onChange: (value: string) => void; placeholder: string}) {
  return <View style={[s.row, {gap: 9, minHeight: 46, paddingLeft: 14, paddingRight: 6, borderRadius: 23, backgroundColor: c.pale, borderWidth: 1, borderColor: c.line}]}>
    <Icon name="search" size={17} color={c.muted} />
    <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#A0A995" autoCorrect={false} returnKeyType="search" style={{flex: 1, fontFamily: 'DM', fontSize: 13, color: c.ink, paddingVertical: 10}} />
    {/* The clear button's slot is always reserved, so the field never changes width while typing. */}
    <View style={{width: 32, height: 32}}><Appear visible={value.length > 0} rise={0}>
      <AnimatedPressable accessibilityLabel="Hapus pencarian" hitSlop={8} onPress={() => onChange('')} style={{width: 32, height: 32, borderRadius: 16, backgroundColor: c.white, alignItems: 'center', justifyContent: 'center'}}><Icon name="x" size={15} /></AnimatedPressable>
    </Appear></View>
  </View>;
}
/**
 * Collapse for a child of a `gap` column: the gap travels with the content, so opening/closing never
 * adds or removes spacing in one jump.
 */
function GapCollapse({visible, gap = 16, children}: {visible: boolean; gap?: number; children: React.ReactNode}) {
  return <View style={{marginTop: -gap}}><Collapse visible={visible}><View style={{paddingTop: gap}}>{children}</View></Collapse></View>;
}
/** Product photo, or a bag icon when there is none. */
function ShopThumb({image, size = 40}: {image?: string; size?: number}) {
  return image ? <Image source={{uri: image}} style={{width: size, height: size, borderRadius: 11}} /> : <View style={{width: size, height: size, borderRadius: 11, backgroundColor: c.pale, alignItems: 'center', justifyContent: 'center'}}><Icon name="shopping-bag" size={15} color={c.muted} /></View>;
}
/** Small toggle on a shopping row: "stock still at home, skip this month". */
function SkipChip({on, onPress}: {on: boolean; onPress: () => void}) {
  return <AnimatedPressable accessibilityRole="switch" accessibilityLabel="Stok masih ada, skip bulan ini" accessibilityState={{checked: on}} hitSlop={8} onPress={onPress} style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: c.pale}}>
    <FadeBg on={on} color={c.lime} radius={14} />
    <PopIn trigger={on}><Icon name={on ? 'check' : 'skip-forward'} size={11} /></PopIn>
    <Text style={s.tagText}>Skip</Text>
  </AnimatedPressable>;
}
const matches = (query: string, ...texts: (string | undefined)[]) => {const q = query.trim().toLowerCase(); return !q || texts.some(text => text?.toLowerCase().includes(q));};
function NoMatch({query}: {query: string}) { return <Text style={[s.muted, {textAlign: 'center', paddingVertical: 14}]}>Tidak ada yang cocok dengan “{query.trim()}”.</Text>; }
/** Icon by kind of need: shopping, electricity and gas have their own, then debt / goal / recurring. */
const needIcon = (need: Need): IconName => isShoppingNeed(need) ? 'shopping-bag' : isElectricityNeed(need) ? 'zap' : isGasNeed(need) ? 'thermometer' : need.kind === 'debt' ? 'credit-card' : need.kind === 'goal' ? 'target' : 'repeat';
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
/** "Setiap hari", "Sen–Jum", "Sen, Rab, Jum". */
function daysText(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Setiap hari';
  if (sorted.length === 1) return `Tiap ${DAY_NAMES[sorted[0]]}`;
  const run = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  return run && sorted.length > 2 ? `${weekdays[sorted[0]]}–${weekdays[sorted[sorted.length - 1]]}` : sorted.map(d => weekdays[d]).join(', ');
}
type ToastMessage = {id: number; text: string; tone: 'success' | 'error'};
/** Toasts appear with pattern 9 (blur 8 px → 0, opacity, scale 0.96 → 1, slight rise) and leave with pattern 3. */
function Toast({toast, bottom, onClose}: {toast: ToastMessage | null; bottom: number; onClose: () => void}) {
  const reducedNow = useReducedMotion();
  const anim = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(1)).current;
  const veil = useVeil();
  const [shown, setShown] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (toast) {
      setShown(toast);
      anim.stopAnimation(); anim.setValue(0); rise.setValue(1);
      if (isReducedMotion()) {rise.setValue(0); fade(anim, 1).start(); return;}
      veil.enter();
      spring(anim, 1).start();
      spring(rise, 0).start();
    } else {
      veil.leave();
      (isReducedMotion() ? fade(anim, 0) : exit(anim, 0, T.close)).start(({finished}) => {if (finished) setShown(null);});
    }
  }, [toast]);
  if (!shown) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[s.toastWrap, {bottom, opacity: anim, transform: reducedNow ? [] : [{translateY: rise.interpolate({inputRange: [0, 1], outputRange: [0, 10]})}, {scale: anim.interpolate({inputRange: [0, 1], outputRange: [0.96, 1]})}]}]}>
      <View style={{maxWidth: '100%', borderRadius: 16, backgroundColor: '#20281F', shadowColor: '#000', shadowOffset: {width: 0, height: 12}, shadowOpacity: .2, shadowRadius: 18, elevation: 10}}>
        <Veiled veil={veil} bg="#20281F" radius={16} tint="dark">
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[s.toast, {shadowOpacity: 0, elevation: 0}]}>
            <PopIn trigger={shown.id}><Icon name={shown.tone === 'error' ? 'alert-circle' : 'check-circle'} size={18} color={shown.tone === 'error' ? '#F0A58F' : c.lime} /></PopIn>
            <Text style={s.toastText}>{shown.text}</Text>
            <AnimatedPressable accessibilityRole="button" accessibilityLabel="Tutup pesan" hitSlop={12} onPress={onClose}><Icon name="x" size={16} color="#C5D1B6" /></AnimatedPressable>
          </View>
        </Veiled>
      </View>
    </Animated.View>
  );
}

type NavAction = 'expense' | 'income' | 'check';
const NAV_TABS = [{key: 'home', icon: 'home', label: 'Beranda'}, {key: 'needs', icon: 'layers', label: 'Kebutuhan'}, {key: 'plus', icon: 'plus', label: 'Tambah transaksi'}, {key: 'calendar', icon: 'calendar', label: 'Kalender'}, {key: 'insights', icon: 'bar-chart-2', label: 'Statistik'}] as const;
const NAV_ACTIONS: {key: NavAction; icon: IconName; label: string}[] = [{key: 'expense', icon: 'arrow-up-right', label: 'Uang keluar'}, {key: 'income', icon: 'arrow-down-left', label: 'Uang masuk'}, {key: 'check', icon: 'search', label: 'Cek sebelum beli'}];
const NAV_CLOSED_WIDTH = 260;

/** Tab icon whose colour cross-fades (200 ms) between inactive and active. */
function NavIcon({name, active}: {name: IconName; active: boolean}) {
  const v = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {Animated.timing(v, {toValue: active ? 1 : 0, duration: isReducedMotion() ? T.reduced : T.fade, useNativeDriver: true}).start();}, [active]);
  return <View>
    <Animated.View style={{opacity: v.interpolate({inputRange: [0, 1], outputRange: [1, 0]})}}><Icon name={name} color="#B3BAA9" size={21} /></Animated.View>
    <Animated.View style={[StyleSheet.absoluteFill, {opacity: v}]}><Icon name={name} color={c.lime} size={21} /></Animated.View>
  </View>;
}

/**
 * Floating bottom nav. The active pill slides between tabs (pattern 6). Tapping "+" MORPHS the pill
 * (width spring, content cross-blur) into [× tutup] [Uang keluar] [Uang masuk] [Cek sebelum beli] and back (pattern 1).
 */
function MorphNav({tab, bottom, onTab, onAction, homeRef}: {tab: Tab; bottom: number; onTab: (tab: Tab) => void; onAction: (action: NavAction) => void; homeRef: React.RefObject<View | null>}) {
  const reducedNow = useReducedMotion();
  const {width: windowWidth} = useWindowDimensions();
  const openWidth = Math.max(NAV_CLOSED_WIDTH, Math.min(windowWidth - 40, 380));
  const [open, setOpen] = useState(false);
  const navW = useRef(new Animated.Value(NAV_CLOSED_WIDTH)).current; // JS-driven (layout)
  const tabsP = useRef(new Animated.Value(1)).current; // native
  const actionsP = useRef(new Animated.Value(0)).current; // native
  const veil = useVeil();
  const navTarget = useRef<View>(null);
  const [slots, setSlots] = useState<Partial<Record<Tab, number>>>({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorShown = useRef(new Animated.Value(0)).current;
  const indicatorPlaced = useRef(false);
  const slot = slots[tab];
  useEffect(() => {
    if (slot === undefined) return;
    if (!indicatorPlaced.current || isReducedMotion()) {indicatorX.setValue(slot); indicatorPlaced.current = true; Animated.timing(indicatorShown, {toValue: 1, duration: T.fade, useNativeDriver: true}).start(); return;}
    spring(indicatorX, slot).start();
  }, [slot]);
  function toggle(next: boolean) {
    if (next === open) return;
    setOpen(next);
    const [leaving, coming] = next ? [tabsP, actionsP] : [actionsP, tabsP];
    leaving.stopAnimation(); coming.stopAnimation(); navW.stopAnimation();
    if (isReducedMotion()) {
      navW.setValue(next ? openWidth : NAV_CLOSED_WIDTH);
      fade(leaving, 0).start(); fade(coming, 1).start();
      return;
    }
    veil.pulse();
    spring(navW, next ? openWidth : NAV_CLOSED_WIDTH, {native: false}).start();
    exit(leaving, 0, T.exit).start();
    spring(coming, 1, {delay: T.enterDelay}).start();
  }
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {toggle(false); return true;});
    return () => sub.remove();
  }, [open]);
  const pillLeft = Animated.multiply(Animated.subtract(openWidth, navW), 0.5);
  const groupStyle = (p: Animated.Value) => ({opacity: p, transform: reducedNow ? [] : [{translateY: p.interpolate({inputRange: [0, 1], outputRange: [6, 0]})}, {scale: p.interpolate({inputRange: [0, 1], outputRange: [0.94, 1]})}]});
  const pill = {position: 'absolute' as const, top: 0, height: 60, left: pillLeft, width: navW, borderRadius: 30};
  return <View pointerEvents="box-none" style={[s.navWrap, {bottom}]}>
    <View style={{width: openWidth, height: 60}}>
      <Animated.View pointerEvents="none" style={[pill, {backgroundColor: c.ink, shadowColor: '#000', shadowOffset: {width: 0, height: 6}, shadowOpacity: .25, shadowRadius: 12, elevation: 8}]} />
      <BlurTarget ref={navTarget} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <Animated.View pointerEvents="none" style={[pill, {backgroundColor: c.ink}]} />
        <Animated.View pointerEvents={open ? 'none' : 'box-none'} accessibilityElementsHidden={open} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'} style={[{position: 'absolute', top: 0, height: 60, left: (openWidth - NAV_CLOSED_WIDTH) / 2, width: NAV_CLOSED_WIDTH, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, groupStyle(tabsP)]}>
          <Animated.View pointerEvents="none" style={{position: 'absolute', top: 10, left: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: '#363C30', opacity: indicatorShown, transform: [{translateX: indicatorX}]}} />
          {NAV_TABS.map(item => item.key === 'plus'
            ? <AnimatedPressable key={item.key} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{expanded: open}} onPress={() => toggle(true)} style={s.navPlus}><Icon name="plus" color={c.ink} size={21} /></AnimatedPressable>
            : <View key={item.key} ref={item.key === 'home' ? homeRef : undefined} collapsable={false} onLayout={(e: LayoutChangeEvent) => {const x = e.nativeEvent.layout.x; setSlots(prev => prev[item.key] === x ? prev : {...prev, [item.key]: x});}}>
                <AnimatedPressable accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{selected: tab === item.key}} onPress={() => onTab(item.key)} style={s.navItem}><NavIcon name={item.icon} active={tab === item.key} /></AnimatedPressable>
              </View>)}
        </Animated.View>
        <Animated.View pointerEvents={open ? 'box-none' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} style={[{position: 'absolute', top: 0, height: 60, left: 0, width: openWidth, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4}, groupStyle(actionsP)]}>
          <PopIn trigger={open}><AnimatedPressable accessibilityRole="button" accessibilityLabel="Tutup pilihan transaksi" onPress={() => toggle(false)} style={s.navPlus}><Icon name="x" color={c.ink} size={21} /></AnimatedPressable></PopIn>
          {NAV_ACTIONS.map(action => <AnimatedPressable key={action.key} accessibilityRole="button" accessibilityLabel={action.label} onPress={() => {toggle(false); onAction(action.key);}} style={{flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 3}}>
            <Icon name={action.icon} color={c.lime} size={18} />
            <Marquee style={{fontFamily: 'DMMedium', fontSize: 10, color: c.white}}>{action.label}</Marquee>
          </AnimatedPressable>)}
        </Animated.View>
      </BlurTarget>
      {veil.active ? <Animated.View pointerEvents="none" style={[pill, {overflow: 'hidden'}]}><BlurLayer veil={veil} target={navTarget} tint="dark" /></Animated.View> : null}
    </View>
  </View>;
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
  // Motion: screen blur veil for tab swaps, fly-to-Uang-Sisa targets, and the held pot value while a chip flies.
  const screenVeil = useVeil();
  const leftoverRef = useRef<View>(null);
  const homeNavRef = useRef<View>(null);
  const potPop = useRef(new Animated.Value(1)).current;
  const [heldPot, setHeldPot] = useState<number | null>(null);
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
  const [profile, setProfile] = useState({name: '', dailyIncome: '', periodStartDay: '1', openingBalance: '', workDays: [1, 2, 3, 4, 5, 6] as number[], activityAllowance: '', payrollCycle: 'daily' as 'daily' | 'monthly', payday: '5', avatarUrl: undefined as string | undefined, working: true});
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
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [dailyDraft, setDailyDraft] = useState<DailyDraft[]>([]);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [leftoverTarget, setLeftoverTarget] = useState<{itemId: string; date: string} | null>(null);
  const [leftoverInput, setLeftoverInput] = useState('');
  const [checkAmount, setCheckAmount] = useState('');
  const [useLeftover, setUseLeftover] = useState<boolean | null>(null);
  // null = follow the default: money recorded in the last days of a period is next month's money.
  const [forNextPeriod, setForNextPeriod] = useState<boolean | null>(null);
  const [shopDraft, setShopDraft] = useState<ShopDraft[]>([]);
  // Shopping sheet: 'edit' is the list, 'item' the form for one item, 'buy' the shopping trip.
  const [shopMode, setShopMode] = useState<'edit' | 'buy' | 'item'>('edit');
  const [shopForm, setShopForm] = useState<ShopForm | null>(null);
  const [shopDayOpen, setShopDayOpen] = useState(false);
  const [shopQuery, setShopQuery] = useState('');
  const [needQuery, setNeedQuery] = useState('');
  const [txQuery, setTxQuery] = useState('');
  const [dailyForm, setDailyForm] = useState<DailyForm | null>(null);
  const [tokenAmount, setTokenAmount] = useState('');
  const [tokenKwh, setTokenKwh] = useState('');
  const [meterKwh, setMeterKwh] = useState('');
  const [elecBudget, setElecBudget] = useState('');
  const [elecPower, setElecPower] = useState<number | undefined>(undefined);
  const [gasAmount, setGasAmount] = useState('');
  const [gasSize, setGasSize] = useState<number>(3);
  const [gasCount, setGasCount] = useState('1');
  const [gasBudget, setGasBudget] = useState('');
  const [skipItem, setSkipItem] = useState('');
  const [skipFrom, setSkipFrom] = useState('');
  const [skipTo, setSkipTo] = useState('');
  const notify = (text: string, tone: ToastMessage['tone'] = 'success') => setToast({id: Date.now(), text, tone});

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.tone === 'error' ? 4000 : 2800);
    return () => clearTimeout(timer);
  }, [toast]);

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
  const budget = useMemo(() => periodBudget(state, today), [state, today]);
  const history = useMemo(() => periodHistory(state, today), [state, today]);
  const electricity = useMemo(() => electricityEstimate(state, today), [state, today]);
  const gas = useMemo(() => gasEstimate(state, today), [state, today]);
  const activeNeeds = [...state.needs].filter(n => !n.paid).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const todayAttendance = state.attendance.find(a => a.date === today);
  const todayIsWorkday = isWorkday(state, today);
  // People without a job never see attendance, payroll or workday settings.
  const working = state.profile.working !== false;

  useEffect(() => {
    loadPlan().then(plan => {if (plan) {setState(plan.state); current.current = plan.state; setDemo(plan.demo); setReminders(plan.reminders); setStarted(true);}}).catch(() => setStorageError('Data lokal belum bisa dibaca. Jangan menimpa data; tutup lalu buka lagi aplikasi.')).finally(() => setLoaded(true));
    const subscription = NativeAppState.addEventListener('change', status => {if (status === 'active') {setToday(localDate()); cloud?.startAutoRefresh();} else cloud?.stopAutoRefresh();});
    if (cloud) cloud.getSession().then(session => setCloudUser(session?.user.email ?? '')).catch(() => {});
    const unsubscribe = cloud?.onAuthStateChange((_event, session) => setCloudUser(session?.user.email ?? ''));
    return () => {subscription.remove(); unsubscribe?.();};
  }, []);
  useEffect(() => {
    // Workdays count as present and daily items as spent automatically; only exceptions need a tap.
    if (!started || demo) return;
    try {const next = applyAutomations(current.current, today); if (next !== current.current) persist(next);} catch {}
  }, [started, demo, today, state]);
  useEffect(() => {
    if (!started) return;
    scheduleReminders(state, reminders && !demo).catch(() => setStorageError('Pengingat belum berhasil diperbarui. Buka pengaturan lalu aktifkan kembali.'));
  }, [state, reminders, demo, started]);

  async function copyBackupToClipboard() {
    try {
      const payload = JSON.stringify({version: 1, state}, null, 2);
      await Clipboard.setStringAsync(payload);
      notify('Cadangan JSON disalin ke clipboard.');
    } catch {
      notify('Gagal menyalin. Clipboard perangkat tidak bisa diakses.', 'error');
    }
  }

  async function shareBackupJson() {
    let copied = false;
    try {
      const payload = JSON.stringify({version: 1, state}, null, 2);
      try {
        await Clipboard.setStringAsync(payload);
        copied = true;
      } catch {}
      const result = await Share.share(
        {
          message: payload,
          title: 'Cadangan DanaSiap',
        },
        {
          dialogTitle: 'Bagikan Cadangan DanaSiap',
        }
      );
      if (result.action === Share.sharedAction) notify(copied ? 'Cadangan siap dibagikan, juga disalin ke clipboard.' : 'Cadangan siap dibagikan.');
    } catch {
      notify(copied ? 'Gagal membuka menu bagikan. Cadangan tetap disalin ke clipboard.' : 'Gagal membagikan cadangan. Coba lagi.', 'error');
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
    if (next === 'expense' || next === 'income') setForNextPeriod(null);
    if (next === 'expense' || next === 'income' || next === 'need') setForm({title: '', amount: '', date: today, category: 'Makan', kind: 'recurring', interval: '7', saved: '', priority: 'essential'});
    if (next === 'setup') setProfile({name: state.profile.name, dailyIncome: state.profile.dailyIncome ? formatThousands(state.profile.dailyIncome) : '', periodStartDay: String(state.profile.periodStartDay ?? 1), openingBalance: state.profile.openingBalance ? formatThousands(state.profile.openingBalance) : '', workDays: [...state.profile.workDays], activityAllowance: state.profile.activityAllowance ? formatThousands(state.profile.activityAllowance) : '', payrollCycle: state.profile.payrollCycle ?? 'daily', payday: String(state.profile.payday ?? 5), avatarUrl: state.profile.avatarUrl, working: state.profile.working !== false});
    if (next === 'expense' || next === 'income') {setUseLeftover(null); setForNextPeriod(false);}
    if (next === 'setup') {setDailyForm(null); setDailyDraft((state.dailyItems ?? migrateDailyBudget(state, today).dailyItems ?? []).map(item => ({id: item.id, title: item.title, amount: formatThousands(item.amount), days: [...item.days], skipHolidays: item.skipHolidays})));}
    if (next === 'check') setCheckAmount('');
    if (next === 'shopping') {setShopMode('edit'); setShopForm(null); setShopQuery(''); setShopDayOpen(false); setShopDraft((state.shopping?.items ?? []).map(shopDraftOf));}
    if (next === 'token') {setTokenAmount(electricity.typicalAmount ? formatThousands(electricity.typicalAmount) : ''); setTokenKwh(''); setMeterKwh(''); setElecBudget(state.electricity?.monthlyBudget ? formatThousands(state.electricity.monthlyBudget) : ''); setElecPower(state.electricity?.power);}
    if (next === 'gas') {setGasAmount(gas.typicalAmount ? formatThousands(gas.typicalAmount) : ''); setGasSize(gas.size !== undefined && (GAS_SIZES as readonly number[]).includes(gas.size) ? gas.size : 3); setGasCount('1'); setGasBudget(state.gas?.monthlyBudget ? formatThousands(state.gas.monthlyBudget) : '');}
    if (next === 'attendance') {
      const existing = state.attendance.find(a => a.date === selectedDay);
      // An automatic "present" is usually opened to report an absence.
      const defaultStatus = existing?.auto ? 'absent' : existing?.status ?? (isWorkday(state, selectedDay) ? 'present' : 'holiday');
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
    notify('Mode data contoh aktif. Data ini bukan saldo pribadimu.');
  }
  /** How much of an expense comes from the "uang sisa" pot, plus a hint about its effect on the allowance. */
  function leftoverPlan(amount: number) {
    const pot = Math.max(0, budget.leftoverPot);
    const available = pot > 0 && form.date >= budget.start && form.date <= today;
    if (!Number.isSafeInteger(amount) || amount <= 0) return {available, on: available && Boolean(useLeftover), from: 0, hint: ''};
    const over = form.date === today && amount > Math.max(0, budget.leftToday);
    const on = available && (useLeftover ?? over);
    const from = !on ? 0 : useLeftover === null ? checkPurchase(budget, amount).fromLeftover : Math.min(pot, amount);
    const rest = amount - from;
    const impact = spendingImpact(budget, amount, from);
    const hint = form.date !== today ? '' : impact.cashShort > 0 ? `Uangnya belum ada. Yang bisa dipakai sekarang ${currency(Math.max(0, budget.money - Math.max(0, budget.leftoverPot)))}.` : impact.shortfall > 0 ? `Uang untuk tagihan jadi kurang ${currency(impact.shortfall)}.` : rest > Math.max(0, budget.leftToday) ? `Jatah jajan jadi ${currency(impact.perDayAfter)}/hari sampai ${shortDate(budget.end)}.` : from > 0 ? `${rest > 0 ? `${currency(rest)} dari jatah hari ini + ` : ''}${currency(from)} dari Uang Sisa (Uang Sisa tinggal ${currency(pot - from)}).` : 'Masih masuk jatah jajan hari ini.';
    return {available, on, from, hint};
  }
  function act(action: FinancialAction, message: string) {
    try {persist(reducer(current.current, action)); setFormError(''); notify(message); return true;} catch (error) {notify(error instanceof Error ? error.message : 'Belum berhasil. Coba lagi.', 'error'); return false;}
  }
  function saveForm() {
    if (!form.title.trim()) {setFormError('Tulis nama transaksi atau kebutuhan dulu.'); return;}
    const amount = number(form.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {setFormError('Nominal harus berupa rupiah bulat, lebih dari nol.'); return;}
    const title = form.title.trim();
    if (sheet === 'need') {
      if (dispatch({type: 'need/add', need: {id: uid(), title, amount, saved: number(form.saved || '0'), dueDate: form.date, kind: form.kind as Need['kind'], ...(form.kind === 'recurring' ? {intervalDays: number(form.interval)} : {}), priority: form.priority as Need['priority']}})) {
        setSheet(null);
        notify(`Rencana ${title} tersimpan untuk ${shortDate(form.date)}.`);
      }
    } else {
      const income = sheet === 'income';
      const fromLeftover = income ? 0 : leftoverPlan(amount).from;
      const effectiveDate = income && (forNextPeriod ?? true) && budget.daysLeft <= 3 ? addDays(budget.end, 1) : undefined;
      if (dispatch({type: 'transaction/add', transaction: {id: uid(), title, amount, date: form.date, category: income ? 'Pemasukan lain' : form.category, type: income ? 'income' : 'expense', ...(fromLeftover > 0 ? {fromLeftover} : {}), ...(effectiveDate ? {effectiveDate} : {})}})) {
        setSheet(null);
        notify(`${income ? 'Uang masuk' : 'Uang keluar'} ${currency(amount)} tersimpan · ${title}.${fromLeftover > 0 ? ` ${currency(fromLeftover)} diambil dari Uang Sisa.` : ''}${effectiveDate ? ` Dihitung mulai ${shortDate(effectiveDate)}.` : ''}`);
      }
    }
  }
  function saveProfile() {
    if (!profile.name.trim()) {setFormError('Isi nama panggilanmu.'); return;}
    const dailyIncome = number(profile.dailyIncome || '0'), openingBalance = number(profile.openingBalance || '0'), activityAllowance = number(profile.activityAllowance || '0'), payday = number(profile.payday || '5'), periodStartDay = number(profile.periodStartDay || '1');
    if (![dailyIncome, openingBalance, activityAllowance, payday].every(v => Number.isSafeInteger(v) && v >= 0)) {setFormError('Nominal harus rupiah bulat dan tidak negatif.'); return;}
    if (periodStartDay < 1 || periodStartDay > 28) {setFormError('Tanggal mulai sebulan harus antara 1 dan 28.'); return;}
    const items: DailyItem[] = [];
    for (const draft of dailyDraft) {
      if (!draft.title.trim() && !draft.amount) continue;
      const amount = number(draft.amount);
      if (!draft.title.trim()) {setFormError('Tulis nama setiap pengeluaran harian.'); return;}
      if (amount <= 0) {setFormError(`Isi nominal per hari untuk ${draft.title.trim()}.`); return;}
      if (!draft.days.length) {setFormError(`Pilih minimal satu hari untuk ${draft.title.trim()}.`); return;}
      items.push({id: draft.id, title: draft.title.trim(), amount, days: draft.days, skipHolidays: draft.skipHolidays, since: today});
    }
    const {name, workDays, payrollCycle, avatarUrl, working: isWorking} = profile;
    try {
      // The stored legacy daily budget is left untouched; old data is migrated before the new list replaces it.
      const base = current.current.dailyItems === undefined ? migrateDailyBudget(current.current, today) : current.current;
      const withProfile = reducer(base, {type: 'profile/update', profile: {name: name.trim(), workDays, dailyIncome, openingBalance, activityAllowance, payrollCycle, payday, avatarUrl, working: isWorking, periodStartDay}});
      persist(reducer(withProfile, {type: 'daily/set', items: items.map(({since, ...item}) => item)}));
      setFormError('');
    } catch (error) {setFormError(error instanceof Error ? error.message : 'Periksa kembali isianmu.'); return;}
    notify(started ? 'Pengaturan tersimpan. Prediksi sudah diperbarui.' : `Halo, ${name.trim()}! Rencanamu siap dipakai.`);
    setStarted(true); setSheet(null);
  }
  // Product photos are cropped square and shrunk to about 200px so the list stays small for cloud sync.
  async function pickShopImage(id: string, source: 'camera' | 'library') {
    try {
      const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {notify(source === 'camera' ? 'Izin kamera belum aktif. Izinkan di pengaturan Android.' : 'Izin galeri belum aktif. Izinkan akses foto di pengaturan Android.', 'error'); return;}
      const options: ImagePicker.ImagePickerOptions = {mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1};
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.length) return;
      for (const compress of [0.7, 0.5, 0.35]) {
        const small = await manipulateAsync(result.assets[0].uri, [{resize: {width: 200, height: 200}}], {compress, format: SaveFormat.JPEG, base64: true});
        const image = `data:image/jpeg;base64,${small.base64}`;
        if (small.base64 && image.length <= MAX_ITEM_IMAGE) {setShopForm(f => f && f.id === id ? {...f, image} : f); return;}
      }
      notify('Foto terlalu besar. Coba foto lain.', 'error');
    } catch {
      notify('Foto belum bisa diambil. Coba lagi.', 'error');
    }
  }
  function chooseShopImage(id: string) {
    showDialog('Foto barang', 'Ambil foto dari mana?', [{text: 'Batal', style: 'cancel'}, {text: 'Galeri', onPress: () => pickShopImage(id, 'library')}, {text: 'Kamera', onPress: () => pickShopImage(id, 'camera')}]);
  }
  function editShop(id: string, changes: Partial<ShopDraft>) { setShopDraft(list => list.map(d => d.id === id ? {...d, ...changes} : d)); }
  const shopLine = (item: ShopDraft) => {const qty = decimal(item.qty || '1'); return qty > 0 ? Math.round(qty * number(item.price || '0')) : 0;};
  // ─── Daily items: list in the setup sheet, one item at a time in its own form ───
  function openDailyItem(draft?: DailyDraft) {
    setFormError('');
    setDailyForm(draft ? {...draft, days: [...draft.days], isNew: false} : {id: uid(), title: '', amount: '', days: [0, 1, 2, 3, 4, 5, 6], skipHolidays: true, isNew: true});
  }
  function editDailyForm(changes: Partial<DailyForm>) { setDailyForm(f => f && {...f, ...changes}); }
  function dailyFormCheck(form: DailyForm): {status: 'empty' | 'clean' | 'valid' | 'invalid'; draft?: DailyDraft; error?: string} {
    const title = form.title.trim();
    if (form.isNew && !title && !form.amount) return {status: 'empty', error: 'Tulis nama pengeluaran hariannya dulu.'};
    if (!title) return {status: 'invalid', error: 'Tulis nama pengeluaran hariannya dulu.'};
    const amount = number(form.amount || '0');
    if (!Number.isSafeInteger(amount) || amount <= 0) return {status: 'invalid', error: `Isi nominal per hari untuk ${title}.`};
    if (!form.days.length) return {status: 'invalid', error: `Pilih minimal satu hari untuk ${title}.`};
    const draft: DailyDraft = {id: form.id, title, amount: formatThousands(amount), days: [...form.days].sort((a, b) => a - b), skipHolidays: form.skipHolidays};
    const old = dailyDraft.find(d => d.id === form.id);
    const same = old && old.title.trim() === draft.title && number(old.amount) === amount && old.skipHolidays === draft.skipHolidays && [...old.days].sort((a, b) => a - b).join() === draft.days.join();
    return {status: same ? 'clean' : 'valid', draft};
  }
  /** Keeps the list in the sheet and, once the plan exists, saves it right away (no separate "save list"). */
  function commitDaily(list: DailyDraft[]) {
    setDailyDraft(list);
    if (!started) return true;
    try {
      const base = current.current.dailyItems === undefined ? migrateDailyBudget(current.current, today) : current.current;
      persist(reducer(base, {type: 'daily/set', items: list.map(d => ({id: d.id, title: d.title.trim(), amount: number(d.amount), days: d.days, skipHolidays: d.skipHolidays}))}));
      return true;
    } catch (error) {setFormError(error instanceof Error ? error.message : 'Periksa kembali isianmu.'); return false;}
  }
  function leaveDailyForm(after: 'list' | 'close') { setFormError(''); if (after === 'close') setSheet(null); else setDailyForm(null); }
  /** Save button: an empty or incomplete form explains what is missing instead of closing. */
  function saveDailyForm(after: 'list' | 'close' = 'list', explicit = true) {
    if (!dailyForm) return;
    const check = dailyFormCheck(dailyForm);
    if (check.status === 'invalid' || (explicit && check.status === 'empty')) {setFormError(check.error ?? ''); return;}
    if (check.status === 'valid' && check.draft) {
      const draft = check.draft;
      const list = dailyDraft.some(d => d.id === draft.id) ? dailyDraft.map(d => d.id === draft.id ? draft : d) : [...dailyDraft, draft];
      if (!commitDaily(list)) return;
      notify(started ? `${draft.title} tersimpan · ${currency(number(draft.amount))}/hari.` : `${draft.title} ditambahkan.`);
    }
    leaveDailyForm(after);
  }
  /** Back / close from the form: valid edits are kept, an empty new item is dropped, a half-filled one asks. */
  function leaveDailyFormSafely(after: 'list' | 'close') {
    if (!dailyForm) return;
    const check = dailyFormCheck(dailyForm);
    if (check.status === 'invalid') showDialog('Belum lengkap', `${check.error} Atau buang perubahan ini.`, [{text: 'Lengkapi', style: 'cancel'}, {text: 'Buang perubahan', style: 'destructive', onPress: () => leaveDailyForm(after)}], {icon: 'edit-3'});
    else saveDailyForm(after, false);
  }
  function deleteDailyItem() {
    if (!dailyForm) return;
    const {id} = dailyForm;
    const name = dailyDraft.find(d => d.id === id)?.title.trim() || 'pengeluaran ini';
    showDialog(`Hapus ${name}?`, 'Pengeluaran harian ini tidak dicatat otomatis lagi mulai hari ini. Catatan hari-hari sebelumnya tetap ada.', [{text: 'Batal', style: 'cancel'}, {text: 'Hapus', style: 'destructive', onPress: () => {if (commitDaily(dailyDraft.filter(d => d.id !== id))) {leaveDailyForm('list'); notify(`${name} dihapus.`);}}}], {icon: 'trash-2'});
  }
  async function pickAvatar() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify('Izin galeri belum aktif. Izinkan akses foto di pengaturan Android.', 'error');
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
            notify('Ukuran foto terlalu besar. Pilih foto lain atau resolusi lebih kecil.', 'error');
            return;
          }
          if (dispatch({type: 'profile/update', profile: {avatarUrl: dataUrl}})) notify('Foto profil diperbarui.');
          setProfile(p => ({...p, avatarUrl: dataUrl}));
        }
      }
    } catch (err) {
      notify(err instanceof Error ? `Gagal memilih foto: ${err.message}` : 'Gagal memilih foto. Coba lagi.', 'error');
    }
  }
  function removeAvatar() {
    showDialog('Hapus foto profil?', 'Fotomu diganti inisial nama.', [{text: 'Batal', style: 'cancel'}, {text: 'Hapus foto', style: 'destructive', onPress: () => {
      if (dispatch({type: 'profile/update', profile: {avatarUrl: undefined}})) notify('Foto profil dihapus.');
      setProfile(p => ({...p, avatarUrl: undefined}));
    }}], {icon: 'image'});
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
    const existed = state.attendance.some(a => a.date === selectedDay);
    if (dispatch({type: 'attendance/record', attendance: {date: selectedDay, status: attStatus, income, allowance}})) {
      setSheet(null);
      const label = {present: 'Masuk kerja', absent: 'Tidak masuk', half: 'Setengah hari', holiday: 'Libur'}[attStatus];
      const detail = income > 0 ? `${label} +${currency(income)}` : label;
      notify(selectedDay > today ? `Rencana kehadiran ${shortDate(selectedDay)} tersimpan · ${label}.` : `Absen ${shortDate(selectedDay)} ${existed ? 'diperbarui' : 'tersimpan'} · ${detail}.`);
    }
  }
  function confirmPay(need: Need) {
    const amount = remainingAmount(need);
    showDialog(`Bayar ${need.title}?`, `${currency(amount)} akan dicatat sebagai pengeluaran hari ini.${need.kind === 'recurring' ? ' Jadwal berikutnya dihitung dari tanggal pembayaran.' : ''}`, [{text: 'Batal', style: 'cancel'}, {text: 'Ya, sudah dibayar', onPress: () => {if (dispatch({type: 'need/pay', id: need.id, date: today})) {setEditingNeed(null); notify(`${need.title} dibayar · ${currency(amount)} dicatat sebagai pengeluaran.`);} else notify('Pembayaran belum tercatat. Periksa lagi rencananya.', 'error');}}]);
  }
  function payNeed(need: Need) {
    // Shopping, electricity and gas needs are paid through their own flows so the real amount is recorded.
    if (isShoppingNeed(need) || isElectricityNeed(need) || isGasNeed(need)) {
      setEditingNeed(null);
      setTimeout(() => {if (isShoppingNeed(need)) openShopping('buy'); else open(isGasNeed(need) ? 'gas' : 'token');}, 250);
    } else confirmPay(need);
  }
  function dailyLeftoverOf(itemId: string, date: string) { return (state.leftovers ?? []).find(l => l.id === `sisa:${itemId}:${date}`)?.amount ?? 0; }
  function markDaily(item: DailyItem, date: string, amount: number, event?: GestureResponderEvent) {
    const label = date === today ? 'hari ini' : shortDate(date);
    const before = current.current;
    if (act({type: 'daily/leftover', itemId: item.id, date, amount}, amount === 0 ? `${item.title} ${label} kembali dihitung terpakai.` : amount === item.amount ? `${item.title} ${label} tidak dipakai · ${currency(amount)} masuk Uang Sisa.` : `Sisa ${item.title} ${label} ${currency(amount)} masuk Uang Sisa.`)) sendToLeftover(pointOf(event), before);
  }
  function openDailyLeftover(item: DailyItem, date: string) {
    const existing = dailyLeftoverOf(item.id, date);
    setLeftoverTarget({itemId: item.id, date}); setLeftoverInput(existing ? formatThousands(existing) : ''); open('daily');
  }
  function saveDailyLeftover(event?: GestureResponderEvent) {
    const item = (state.dailyItems ?? []).find(i => i.id === leftoverTarget?.itemId);
    if (!item || !leftoverTarget) return;
    const amount = number(leftoverInput || '0');
    if (amount > item.amount) {setFormError(`Sisa maksimal ${currency(item.amount)}.`); return;}
    const before = current.current;
    if (dispatch({type: 'daily/leftover', itemId: item.id, date: leftoverTarget.date, amount})) {
      setSheet(null);
      sendToLeftover(pointOf(event), before, T.flyDelayAfterSheet);
      notify(amount > 0 ? `Sisa ${item.title} ${currency(amount)} masuk Uang Sisa.` : `${item.title} dihitung terpakai penuh.`);
    }
  }
  function openShopping(mode: 'edit' | 'buy') {
    open('shopping');
    if (mode === 'buy') startBuying();
  }
  const shopDueDay = state.shopping?.dueDay ?? state.profile.periodStartDay ?? 1;
  /** Every change to the list is saved at once: the list view never needs its own "save" button. */
  function saveShoppingItems(items: ShoppingItem[], dueDay = current.current.shopping?.dueDay ?? shopDueDay) { return dispatch({type: 'shopping/set', items, dueDay}); }
  function toggleShopSkip(id: string) {
    const items = current.current.shopping?.items ?? [];
    const item = items.find(i => i.id === id);
    if (!item) return;
    const {skip, ...rest} = item;
    saveShoppingItems(items.map(i => i.id === id ? (skip ? rest : {...rest, skip: true}) : i));
  }
  function setShopDay(dueDay: number) { saveShoppingItems(current.current.shopping?.items ?? [], dueDay); }
  function startBuying() {
    const items = current.current.shopping?.items ?? [];
    if (!items.some(item => !item.skip)) {notify('Belum ada barang yang perlu dibeli. Tambah barang dulu.', 'error'); return;}
    setFormError(''); setShopDraft(items.map(shopDraftOf)); setShopMode('buy');
  }
  function openShopItem(item?: ShoppingItem) {
    setFormError('');
    setShopForm(item ? {...shopDraftOf(item), isNew: false} : {id: uid(), name: '', qty: '1', price: '', skip: false, bought: false, isNew: true});
    setShopMode('item');
  }
  function editShopForm(changes: Partial<ShopForm>) { setShopForm(f => f && {...f, ...changes}); }
  function shopFormCheck(form: ShopForm): {status: 'empty' | 'clean' | 'valid' | 'invalid'; item?: ShoppingItem; error?: string} {
    const name = form.name.trim();
    if (form.isNew && !name && !form.price && !form.image) return {status: 'empty', error: 'Tulis nama barangnya dulu.'};
    if (!name) return {status: 'invalid', error: 'Tulis nama barangnya dulu.'};
    const qty = decimal(form.qty || '1');
    if (!(qty > 0) || qty > 100_000) return {status: 'invalid', error: `Jumlah ${name} harus lebih dari 0.`};
    const price = number(form.price || '0');
    if (!Number.isSafeInteger(price) || price < 0) return {status: 'invalid', error: 'Harga harus rupiah bulat.'};
    const item: ShoppingItem = {id: form.id, name, qty, price, ...(form.skip ? {skip: true} : {}), ...(form.image ? {image: form.image} : {})};
    const saved = current.current.shopping?.items.find(i => i.id === form.id);
    const key = (i: ShoppingItem) => JSON.stringify([i.name, i.qty, i.price, Boolean(i.skip), i.image ?? '']);
    return {status: saved && key(saved) === key(item) ? 'clean' : 'valid', item};
  }
  function leaveShopForm(after: 'list' | 'close') { setFormError(''); if (after === 'close') setSheet(null); else setShopMode('edit'); }
  /** Simpan: saves this one item into the list; an empty or incomplete form explains what is missing. */
  function saveShopForm(after: 'list' | 'close' = 'list', explicit = true) {
    if (!shopForm) return;
    const check = shopFormCheck(shopForm);
    if (check.status === 'invalid' || (explicit && check.status === 'empty')) {setFormError(check.error ?? ''); return;}
    if (check.status === 'valid' && check.item) {
      const item = check.item;
      const items = current.current.shopping?.items ?? [];
      const next = items.some(i => i.id === item.id) ? items.map(i => i.id === item.id ? item : i) : [...items, item];
      if (!saveShoppingItems(next)) return;
      notify(`${item.name} tersimpan · total belanja ${currency(shoppingTotal({items: next, dueDay: shopDueDay}))}.`);
    }
    leaveShopForm(after);
  }
  /** Back / close from the form: valid edits are kept, an empty new item is dropped, a half-filled one asks. */
  function leaveShopFormSafely(after: 'list' | 'close') {
    if (!shopForm) return;
    const check = shopFormCheck(shopForm);
    if (check.status === 'invalid') showDialog('Barangnya belum lengkap', `${check.error} Atau buang perubahan ini.`, [{text: 'Lengkapi', style: 'cancel'}, {text: 'Buang perubahan', style: 'destructive', onPress: () => leaveShopForm(after)}], {icon: 'edit-3'});
    else saveShopForm(after, false);
  }
  function deleteShopItem() {
    if (!shopForm) return;
    const {id} = shopForm;
    const name = current.current.shopping?.items.find(i => i.id === id)?.name || 'barang ini';
    showDialog(`Hapus ${name}?`, 'Barang ini dihapus dari daftar belanja bulanan.', [{text: 'Batal', style: 'cancel'}, {text: 'Hapus', style: 'destructive', onPress: () => {if (saveShoppingItems((current.current.shopping?.items ?? []).filter(i => i.id !== id))) {leaveShopForm('list'); notify(`${name} dihapus dari daftar belanja.`);}}}], {icon: 'trash-2'});
  }
  /** Backdrop and the X button close the sheet; an open item form is saved first when it is valid. */
  function closeSheet(force = false) {
    // Back/backdrop first put the keyboard away; the X button always closes.
    if (keyboardHeight > 0) {Keyboard.dismiss(); if (!force) return;}
    if (sheet === 'shopping' && shopMode === 'item' && shopForm) {leaveShopFormSafely('close'); return;}
    if (sheet === 'setup' && dailyForm) {leaveDailyFormSafely('close'); return;}
    setSheet(null);
  }
  /** Hardware Back and the ← button: an item form returns to its list first. */
  function backSheet(force = false) {
    if (keyboardHeight > 0) {Keyboard.dismiss(); if (!force) return;}
    if (sheet === 'shopping' && shopMode === 'item' && shopForm) {leaveShopFormSafely('list'); return;}
    if (sheet === 'setup' && dailyForm) {leaveDailyFormSafely('list'); return;}
    closeSheet(force);
  }
  function finishShopping(event?: GestureResponderEvent) {
    const items = [];
    for (const draft of shopDraft.filter(d => !d.skip)) {
      const qty = decimal(draft.qty || '1');
      if (draft.bought && (!(qty > 0) || qty > 100_000)) {setFormError(`Jumlah ${draft.name} harus lebih dari 0.`); return;}
      items.push({id: draft.id, qty: qty > 0 ? qty : 1, price: number(draft.price || '0'), bought: draft.bought});
    }
    const active = state.needs.find(n => isShoppingNeed(n) && !n.paid);
    const actual = items.filter(i => i.bought).reduce((sum, i) => sum + Math.round(i.qty * i.price), 0);
    const planned = active ? remainingAmount(active) : actual;
    const before = current.current;
    if (dispatch({type: 'shopping/finish', id: `belanja:${uid()}`, date: today, items})) {
      setSheet(null);
      sendToLeftover(pointOf(event), before, T.flyDelayAfterSheet);
      notify(planned > actual ? `Belanja ${currency(actual)} tercatat. Lebih hemat ${currency(planned - actual)}, masuk Uang Sisa.` : planned < actual ? `Belanja ${currency(actual)} tercatat, lebih ${currency(actual - planned)} dari rencana.` : `Belanja ${currency(actual)} tercatat, pas sesuai rencana.`);
    }
  }
  function buyToken() {
    const amount = number(tokenAmount || '0');
    if (amount <= 0) {notify('Isi nominal token yang dibeli.', 'error'); return;}
    const kwh = tokenKwh.trim() ? decimal(tokenKwh) : undefined;
    if (kwh !== undefined && !(kwh > 0 && kwh <= 100_000)) {notify('kWh dari struk harus angka lebih dari 0.', 'error'); return;}
    if (act({type: 'electricity/purchase', purchase: {id: uid(), date: today, amount, ...(kwh ? {kwh} : {})}}, `Beli token ${currency(amount)} tercatat${kwh ? ` · ${kwhText(kwh)} kWh` : ''}.`)) setTokenKwh('');
  }
  function saveMeter() {
    const kwh = decimal(meterKwh);
    if (!(kwh >= 0 && kwh <= 100_000)) {notify('Isi sisa kWh yang tampil di meteran.', 'error'); return;}
    if (act({type: 'electricity/reading', reading: {date: today, kwh}}, `Meteran hari ini ${kwhText(kwh)} kWh tersimpan.`)) setMeterKwh('');
  }
  function saveElectricitySettings() {
    const monthlyBudget = elecBudget ? number(elecBudget) : undefined;
    act({type: 'electricity/settings', monthlyBudget: monthlyBudget || undefined, power: elecPower}, 'Pengaturan listrik tersimpan.');
  }
  function buyGas() {
    const amount = number(gasAmount || '0');
    if (!Number.isSafeInteger(amount) || amount <= 0) {notify('Isi harga gas yang dibayar.', 'error'); return;}
    const count = Number(gasCount.trim());
    if (!Number.isInteger(count) || count < 1 || count > 20) {notify('Jumlah tabung harus 1 sampai 20.', 'error'); return;}
    if (act({type: 'gas/purchase', purchase: {id: uid(), date: today, amount, size: gasSize, count}}, `Beli gas ${currency(amount)} tercatat.`)) setGasCount('1');
  }
  function saveGasSettings() {
    const monthlyBudget = gasBudget ? number(gasBudget) : undefined;
    act({type: 'gas/settings', monthlyBudget: monthlyBudget || undefined}, 'Pengaturan gas tersimpan.');
  }
  function openSkip(itemId?: string) {
    setSkipItem(itemId ?? state.dailyItems?.[0]?.id ?? ''); setSkipFrom(selectedDay < today ? today : selectedDay); setSkipTo(addDays(selectedDay < today ? today : selectedDay, 6)); open('skip');
  }
  function saveSkip(event?: GestureResponderEvent) {
    const item = (state.dailyItems ?? []).find(i => i.id === skipItem);
    if (!item) {setFormError('Pilih pengeluaran harian dulu.'); return;}
    const before = current.current;
    if (dispatch({type: 'daily/skipRange', itemId: item.id, from: skipFrom.trim(), to: skipTo.trim()})) {
      setSheet(null); sendToLeftover(pointOf(event), before, T.flyDelayAfterSheet); notify(`${item.title} ditandai libur ${shortDate(skipFrom.trim())} – ${shortDate(skipTo.trim())}. Uangnya masuk Uang Sisa di tiap harinya.`);
    }
  }
  async function runCloud(task: () => Promise<void>) {setBusy(true); setCloudMessage(''); try {await task();} catch (error) {const message = error instanceof Error ? error.message : 'Koneksi belum berhasil. Coba lagi nanti.'; setCloudMessage(message); notify(message, 'error');} finally {setBusy(false);}}
  async function upload() {
    if (!cloud) return;
    if (demo) {setCloudMessage('Data contoh tidak diunggah. Mulai data pribadi dulu.'); notify('Data contoh tidak diunggah. Mulai data pribadi dulu.', 'error'); return;}
    const remote = await cloud.loadSnapshot();
    if (remote) {
      showDialog('Perbarui data cloud?', 'Data cloud akan diganti oleh data dari perangkat ini. Pastikan perangkat ini berisi perubahan terbaru.', [{text: 'Batal', style: 'cancel'}, {text: 'Unggah data ini', onPress: () => runCloud(async () => {await cloud!.saveSnapshot(current.current, remote.revision); setCloudMessage('Data tersimpan di cloud. Di web, pilih ambil dari cloud.'); notify('Data berhasil diunggah ke cloud.');})}]);
    } else {await cloud.saveSnapshot(current.current, 0); setCloudMessage('Data pertama berhasil tersimpan di cloud.'); notify('Data pertama berhasil diunggah ke cloud.');}
  }
  async function download() {
    if (!cloud) return;
    const remote = await cloud.loadSnapshot();
    if (!remote) {setCloudMessage('Belum ada data di cloud. Unggah dari perangkat utama dulu.'); notify('Belum ada data di cloud. Unggah dari perangkat utama dulu.', 'error'); return;}
    showDialog('Ambil data cloud?', 'Data pada perangkat ini akan diganti dengan data cloud. Buat cadangan terlebih dahulu jika diperlukan.', [{text: 'Batal', style: 'cancel'}, {text: 'Ambil data', onPress: () => {setDemo(false); persist(remote.data, false); setCloudMessage('Data cloud sudah tersimpan di perangkat ini.'); notify('Data cloud dimuat ke perangkat ini.');}}]);
  }
  if (!loaded) return <SafeAreaView style={[s.screen, {justifyContent: 'center'}]}><ActivityIndicator color={c.ink} /></SafeAreaView>;

  const welcome = <SafeAreaView style={s.welcome}>
    <Grid /><View style={s.between}><View style={[s.row, {gap: 7}]}><Icon name="aperture" size={23} /><Text style={[s.heading, {fontSize: 24}]}>DanaSiap</Text></View><Text style={[s.mini, {color: c.ink}]}>KEUANGAN PRIBADI</Text></View>
    <Image source={require('../assets/welcome.png')} resizeMode="contain" style={{width: '100%', height: '41%', alignSelf: 'center'}} />
    <View style={{gap: 17}}><Text style={s.welcomeTitle}>Uang hari ini.{`\n`}Tenang untuk{`\n`}hari nanti. <Text style={{fontSize: 42}}>↗</Text></Text><Text style={[s.body, {lineHeight: 21, maxWidth: 290}]}>Kerja, nabung, dan kebutuhanmu.{`\n`}Semuanya punya rencana.</Text>
      {storageError ? <Text style={s.error}>{storageError}</Text> : <><Button title="Mulai rencana gue" icon="arrow-up-right" onPress={() => open('setup')} /><AnimatedPressable accessibilityRole="button" onPress={startDemo} style={{padding: 9, alignItems: 'center'}}><Text style={s.actionLabel}>Lihat dulu dengan data contoh →</Text></AnimatedPressable></>}
    </View>
  </SafeAreaView>;

  function switchTab(nextTab: Tab) {
    if (nextTab === tab) return;
    // Pattern 1: the content area cross-blurs (see CrossBlur around the screens); the nav pill slides.
    setTab(nextTab);
  }
  /**
   * Pattern 8: when money lands in Uang Sisa, a "+Rp …" chip flies from where it came from to the
   * Uang Sisa card (or the Beranda tab when the card is not on screen). The card value waits for the chip.
   */
  function sendToLeftover(point: {x: number; y: number} | null, before: AppState, delay = 0) {
    let prev = 0, next = 0;
    try {prev = Math.max(0, periodBudget(before, today).leftoverPot); next = Math.max(0, periodBudget(current.current, today).leftoverPot);} catch {return;}
    if (next <= prev || !point || isReducedMotion()) return;
    setHeldPot(prev);
    const target = tab === 'home' && leftoverRef.current ? leftoverRef.current : homeNavRef.current;
    const land = () => {setHeldPot(null); potPop.setValue(1.04); spring(potPop, 1, {pop: true}).start();};
    measure(target).then(rect => {
      const {width, height} = Dimensions.get('window');
      const to = rect && rect.y + rect.height > 0 && rect.y < height ? rect : {x: width / 2 - 20, y: height - 90, width: 40, height: 40};
      flyChip({from: point, to, text: `+${currency(next - prev)}`, delay, onLand: land});
    });
  }

  // A plain function (not a component defined in render) so rows are not remounted on every render.
  function needRow(need: Need, compact = false) {
    const risk = projection.risks.find(r => r.needId === need.id);
    return (
      <AnimatedPressable
        key={need.id}
        accessibilityLabel={`Detail ${need.title}`}
        onPress={() => {setFormError(''); setRescheduleDate(need.dueDate); setAllocatedInput(formatThousands(need.saved)); setEditingNeed(need);}}
        style={{gap: 10, paddingVertical: 5}}
      >
        <View style={[s.row, {gap: 11}]}>
          <View style={[s.needIcon, {backgroundColor: need.kind === 'debt' ? '#ECF2DE' : '#F4F7EE'}]}>
            <Icon name={needIcon(need)} size={18} />
          </View>
          <View style={{flex: 1, gap: 4}}>
            <Marquee style={s.listTitle}>{need.title}</Marquee>
            <Marquee style={s.mini}>{`${shortDate(need.dueDate)} · ${need.kind === 'recurring' ? `Setiap ${need.intervalDays} hari` : need.kind === 'debt' ? 'Utang' : 'Target'}`}</Marquee>
          </View>
          <View style={{alignItems: 'flex-end', gap: 3}}>
            <Text style={s.amount}>{currency(remainingAmount(need))}</Text>
            <Text style={[s.mini, risk && {color: c.red}]}>{risk ? `Kurang ${currency(risk.shortfall)}` : 'Terencana'}</Text>
          </View>
        </View>
        {!compact && (
          <>
            <View style={s.progress}><View style={[s.progressFill, {width: `${Math.min(100, need.saved / need.amount * 100)}%`}]} /></View>
            <View style={s.between}><Text style={s.mini}>Sudah disisihkan {currency(need.saved)}</Text><Text style={s.mini}>{Math.round(need.saved / need.amount * 100)}%</Text></View>
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
        onPress={() => showDialog('Peringatan DanaSiap', projection.risks.length ? projection.risks.map(r => `${r.title} (${shortDate(r.date)}): diprediksi kurang ${currency(r.shortfall)}`).join('\n') : 'Belum ada kekurangan yang diprediksi berdasarkan rencana saat ini.', undefined, {icon: 'bell'})}
      >
        <Icon name="bell" size={19} />
        {projection.risks.length > 0 && <View style={{position: 'absolute', width: 6, height: 6, backgroundColor: '#D97553', borderRadius: 4, top: 10, right: 12}} />}
      </AnimatedPressable>
    </View>
  );

  const line = (label: string, value: string, strong = false) => <View key={label} style={[s.between, {gap: 12}]}><Text style={[s.mini, {flex: 1}, strong && {color: c.ink, fontFamily: 'DMMedium', fontSize: 11}]}>{label}</Text><RollingValue value={value} align="right" bg={c.white} style={[s.body, {fontFamily: strong ? 'Barlow' : 'BarlowMedium', fontSize: strong ? 17 : 14}]} /></View>;
  function dailyEntry(item: DailyItem, date: string) {
    const left = dailyLeftoverOf(item.id, date);
    const recorded = state.transactions.some(t => t.id === dailyTransactionId(item.id, date));
    const unused = left >= item.amount;
    const status = unused ? `Tidak dipakai · ${currency(left)} masuk Uang Sisa` : left > 0 ? `Terpakai ${currency(item.amount - left)} · ${currency(left)} masuk Uang Sisa` : recorded ? 'Tercatat otomatis' : date > today ? 'Terjadwal · tercatat otomatis di harinya' : 'Terjadwal';
    return <View key={item.id} style={{gap: 9, paddingVertical: 4}}>
      <View style={[s.row, {gap: 11}]}>
        <View style={[s.needIcon, {backgroundColor: unused ? '#F4F6F0' : '#ECF2DE'}]}><Icon name={unused ? 'slash' : left > 0 ? 'corner-down-left' : 'check'} size={17} /></View>
        <View style={{flex: 1, gap: 4}}><Marquee style={s.listTitle}>{item.title}</Marquee><CrossBlur k={status} variant="value"><Marquee style={[s.mini, left > 0 && {color: '#5E7F2A'}]}>{status}</Marquee></CrossBlur></View>
        <Text style={[s.amount, unused && {color: c.muted, textDecorationLine: 'line-through'}]}>{currency(item.amount)}</Text>
      </View>
      <StaggerList style={[s.row, {gap: 7, flexWrap: 'wrap'}]}>
        {!unused && <TinyButton label="Nggak dipakai" onPress={e => markDaily(item, date, item.amount, e)} />}
        <TinyButton label="Ada sisa" onPress={() => openDailyLeftover(item, date)} />
        {left > 0 && <TinyButton label="Batalkan" onPress={() => markDaily(item, date, 0)} />}
      </StaggerList>
    </View>;
  }
  const todayPlans = budget.dailyPlans.filter(p => p.today.scheduled);
  // Explains a zero or limited allowance, so the number never looks arbitrary.
  const nextMoney = budget.nextIncome ?? budget.nextPeriodIncome;
  const budgetNote = budget.shortfall > 0 ? '' : budget.perDay === 0
    ? `Belum ada uang untuk jajan.${nextMoney ? ` Uang berikutnya ± ${currency(nextMoney.amount)} masuk ${shortDate(nextMoney.date)}.` : ' Catat uang masuk begitu uang bulanan datang.'}`
    : budget.cashLimitedUntil ? `Jatah dijaga dari uang yang sudah ada. Naik lagi setelah uang masuk ${shortDate(budget.cashLimitedUntil)}.` : '';
  const budgetCard = <View style={s.section}>
    <PanelNotch />
    <View style={s.between}><Text style={s.mini}>{`${shortDate(budget.start)} – ${shortDate(budget.end)} · ${budget.daysLeft === 1 ? 'hari terakhir' : `${budget.daysLeft} hari lagi`}`}</Text><Icon name="calendar" size={15} color={c.muted} /></View>
    <View>
      <Text style={s.mini}>Bisa dipakai jajan hari ini</Text>
      <RollingValue value={currency(Math.max(0, budget.leftToday))} bg={c.white} containerStyle={{alignSelf: 'flex-start', marginTop: 2}} style={[s.number, {fontSize: 36}]} />
      <Text style={[s.mini, budget.leftToday < 0 && {color: c.red}]}>{budget.leftToday < 0 ? `Kelebihan ${currency(-budget.leftToday)} dari jatah hari ini` : `Jatah ${currency(budget.perDay)} · sudah dipakai ${currency(budget.spentToday)}`}</Text>
    </View>
    {budgetNote ? <View style={{backgroundColor: '#F1F6E7', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12}}><Text style={[s.muted, {color: '#55604A'}]}>{budgetNote}</Text></View> : null}
    <View style={[s.row, {gap: 9, padding: 11, borderRadius: 14, backgroundColor: budget.shortfall === 0 ? '#ECF2DE' : budget.coveredByLeftover ? '#FBF3E0' : '#FDF0EE'}]}>
      <Icon name={budget.shortfall === 0 ? 'shield' : 'alert-circle'} size={16} color={budget.shortfall > 0 && !budget.coveredByLeftover ? c.red : c.ink} />
      <Text style={[s.body, {flex: 1, lineHeight: 17}, budget.shortfall > 0 && !budget.coveredByLeftover && {color: c.red}]}>{budget.shortfall === 0 ? '✓ Uang untuk tagihan & kebutuhan cukup' : budget.coveredByLeftover ? `Cukup, asal pakai ${currency(budget.shortfall)} dari Uang Sisa` : `Uang kurang ${currency(budget.shortfall)} untuk tagihan & kebutuhan${budget.shortfallDate ? ` (mulai ${shortDate(budget.shortfallDate)})` : ''}`}</Text>
    </View>
    <Collapse visible={showBreakdown}><StaggerList visible={showBreakdown} origin="bottom" bg={c.white} style={{gap: 8}}>
      {line('Uang yang ada sekarang', currency(budget.money))}
      {budget.expectedIncome > 0 && line('+ Uang yang akan masuk (gaji/upah)', currency(budget.expectedIncome))}
      {line(`− Tagihan & kebutuhan sampai ${shortDate(budget.end)}`, currency(budget.obligations))}
      {line(`− Ongkos & uang harian sampai ${shortDate(budget.end)}`, currency(budget.dailyRemaining))}
      {budget.reservedAfterPeriod > 0 && line('− Disimpan untuk kebutuhan sebelum uang berikutnya masuk', currency(budget.reservedAfterPeriod))}
      {budget.leftoverPot > 0 && line('− Uang Sisa (disimpan terpisah)', currency(budget.leftoverPot))}
      <View style={s.divider} />
      {line(budget.freeMoney < 0 ? `= Kurang sampai ${shortDate(budget.end)}` : `= Sisa untuk jajan sampai ${shortDate(budget.end)}`, currency(budget.freeMoney), true)}
      {line(budget.cashLimitedUntil || (budget.perDay === 0 && budget.freeMoney > 0) ? 'Jatah jajan per hari (dari uang yang sudah ada)' : `Jatah jajan per hari (dibagi ${budget.daysLeft} hari)`, `${currency(budget.perDay)}/hari`)}
      {line('Bisa dipakai sekarang tanpa ganggu tagihan', currency(budget.safeNow))}
      {budget.nextPeriodIncome ? <Text style={s.muted}>{`Gaji ± ${currency(budget.nextPeriodIncome.amount)} tanggal ${shortDate(budget.nextPeriodIncome.date)} masuk di akhir bulan, jadi dihitung untuk bulan berikutnya.`}</Text> : null}
      <View style={s.divider} />
      {budget.carryOver > 0 && line('Sisa dari bulan lalu', currency(budget.carryOver))}
      {line('Uang masuk bulan ini', currency(budget.periodIncome))}
      {budget.heldForNextPeriod > 0 && <Text style={s.muted}>{currency(budget.heldForNextPeriod)} disimpan untuk bulan berikutnya, belum dihitung di sini.</Text>}
    </StaggerList></Collapse>
    <View style={[s.row, {gap: 8}]}>
      <View style={{flex: 1}}><Button title={showBreakdown ? 'Tutup rincian' : 'Lihat rinciannya'} secondary icon={showBreakdown ? 'chevron-up' : 'list'} onPress={() => setShowBreakdown(!showBreakdown)} /></View>
      <View style={{flex: 1}}><Button title="Cek sebelum beli" icon="search" onPress={() => open('check')} /></View>
    </View>
  </View>;
  const dailyToday = <View style={s.section}>
    <PanelNotch />
    <SectionHead title="Pengeluaran hari ini" action="Atur" onPress={() => open('setup')} />
    {!(state.dailyItems ?? []).length ? <><Empty text="Belum ada pengeluaran harian. Tambahkan ongkos anak, uang masak, atau lainnya supaya tercatat otomatis tiap hari." /><Button title="Atur pengeluaran harian" secondary icon="plus" onPress={() => open('setup')} /></> : todayPlans.length ? todayPlans.map((plan, i) => <React.Fragment key={plan.item.id}>{i > 0 && <View style={s.divider} />}{dailyEntry(plan.item, today)}</React.Fragment>) : <Text style={s.muted}>Hari ini nggak ada pengeluaran harian yang terjadwal.</Text>}
  </View>;
  const leftoverCard = <Animated.View style={{transform: [{scale: potPop}]}}><AnimatedPressable viewRef={leftoverRef} accessibilityLabel="Buka Uang Sisa" onPress={() => open('leftover')} style={[s.section, {flexDirection: 'row', alignItems: 'center', gap: 13}]}>
    <PopIn trigger={heldPot === null ? budget.leftoverPot : 'held'} style={[s.needIcon, {backgroundColor: c.lime}]}><Icon name="archive" size={18} /></PopIn>
    <View style={{flex: 1, gap: 3}}><Text style={s.mini}>UANG SISA BULAN INI</Text><RollingValue value={currency(heldPot ?? Math.max(0, budget.leftoverPot))} bg={c.white} containerStyle={{alignSelf: 'flex-start'}} style={[s.number, {fontSize: 24}]} /><Text style={s.mini}>{budget.leftovers.length ? `${budget.leftovers.length} catatan · sudah dipakai ${currency(budget.leftoverUsed)}` : 'Uang yang nggak jadi dipakai, misal ongkos saat anak libur'}</Text></View>
    <Icon name="chevron-right" />
  </AnimatedPressable></Animated.View>;

  // Screens are built only when shown: typing in a sheet must not rebuild all four tabs.
  const renderHome = () => <>
    {header}
    {demo && (
      <AnimatedPressable
        onPress={() => open('settings')}
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
        <RollingValue value={currency(balance(state))} bg={c.ink} containerStyle={{alignSelf: 'flex-start', marginTop: 4}} style={[s.cardBalance, {fontSize: 36, marginTop: 0}]} />
      </View>

      {/* Safe to spend section */}
      <View style={{marginTop: 18}}>
        <Text style={[s.cardLabel, {fontSize: 9.5, letterSpacing: 1.2, color: '#97A588'}]}>BISA DIPAKAI SEKARANG</Text>
        <RollingValue value={currency(budget.safeNow)} bg={c.ink} containerStyle={{alignSelf: 'flex-start', marginTop: 3}} style={[s.cardBalance, {fontSize: 24, color: c.lime, marginTop: 0}]} />
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
      >
        <View style={s.cardAturDanaPlus}>
          <Icon name="plus" size={10} color={c.lime} />
        </View>
        <Text style={s.cardAturDanaText}>Atur dana</Text>
      </AnimatedPressable>
    </View>

    {budgetCard}

    {/* Quick Action Shortcuts */}
    <View style={s.between}>
      {([
        {name: 'arrow-up-right', label: 'Uang keluar', action: () => open('expense')},
        {name: 'arrow-down-left', label: 'Uang masuk', action: () => open('income')},
        working ? {name: 'calendar', label: 'Absensi', action: () => {
          setSelectedDay(today);
          const status = todayAttendance?.auto ? 'absent' : todayAttendance?.status ?? (todayIsWorkday ? 'present' : 'holiday');
          setAttStatus(status);
          setAttIncome(formatThousands(status === 'present' ? todayAttendance?.income ?? state.profile.dailyIncome : 0));
          setSheet('attendance');
          setFormError('');
        }} : {name: 'layers', label: 'Rencana', action: () => open('need')},
        {name: 'grid', label: 'Lainnya', action: () => open('settings')},
      ] as {name: IconName; label: string; action: () => void}[]).map((item, i) => (
        <AnimatedPressable
          key={item.label}
          accessibilityLabel={item.label}
          onPress={item.action}
          style={s.shortcut}
        >
          <View style={[s.shortcutCircle, i === 3 && {backgroundColor: c.lime}]}>
            <Icon name={item.name} size={23} />
          </View>
          <Text style={s.actionLabel}>{item.label}</Text>
        </AnimatedPressable>
      ))}
    </View>

    {dailyToday}

    {leftoverCard}

    {working && <View style={s.section}>
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
    </View>}

    <View style={s.section}>
      <PanelNotch />
      <SectionHead title="Kebutuhan terdekat" action="Lihat semua" onPress={() => switchTab('needs')} />
      {activeNeeds.length ? (
        activeNeeds.slice(0, 3).map((need, i) => (
          <React.Fragment key={need.id}>
            {i > 0 && <View style={s.divider} />}
            {needRow(need, true)}
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
          <Appear key={t.id} style={{gap: 13}}>
            {i > 0 && <View style={s.divider} />}
            <View style={[s.row, {gap: 11}]}>
              <View style={[s.needIcon, {backgroundColor: c.ink}]}>
                <Icon name={t.type === 'income' ? 'arrow-down-left' : 'shopping-bag'} size={17} color={c.white} />
              </View>
              <View style={{flex: 1, gap: 4}}>
                <Marquee style={s.listTitle}>{t.title}</Marquee>
                <Text style={s.mini}>{shortDate(t.date)} · {t.category}</Text>
              </View>
              <Text style={s.amount}>{t.type === 'income' ? '+' : '−'}{currency(t.amount)}</Text>
            </View>
          </Appear>
        ))
      ) : (
        <Empty text="Catat pengeluaran pertamamu lewat tombol + di bawah." />
      )}
    </View>

    <Notice
      title={projection.shortfall > 0 ? `Ada potensi kurang ${currency(projection.shortfall)}` : !working ? 'Rencana tetap jalan.' : todayIsWorkday ? 'Satu hari kerja, satu langkah lagi.' : 'Hari ini libur. Rencana tetap jalan.'}
      text={projection.shortfall > 0 ? (working ? 'Cek rencana dan simulasi absensi supaya kebutuhan tetap kebayar tepat waktu.' : 'Cek rencana kebutuhan dan catat uang masuk supaya kebutuhan tetap kebayar tepat waktu.') : !working ? 'Catat uang masuk dan keluar. Kebutuhan dan jatuh tempo tetap diperhitungkan.' : todayIsWorkday ? `Target alokasi ${currency(projection.requiredDaily)} per hari kerja. Hari ini otomatis tercatat masuk, tandai lewat Absensi kalau nggak masuk.` : 'Pemasukan hari libur tidak dihitung. Pengeluaran dan jatuh tempo tetap diperhitungkan.'}
    />
  </>;

  const renderNeeds = () => <>
    <View style={s.between}>
      <View>
        <Text style={s.mini}>SATU PER SATU, JADI SIAP</Text>
        <Text style={[s.title, {fontSize: 33}]}>Rencana kebutuhan</Text>
      </View>
      <AnimatedPressable accessibilityLabel="Tambah kebutuhan" onPress={() => open('need')} style={[s.circle, {backgroundColor: c.lime}]}>
        <Icon name="plus" />
      </AnimatedPressable>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingVertical: 2}} style={{flexGrow: 0}}>
      <SegmentPills style={{gap: 8}} options={[{key: 'all', label: 'Semua'}, {key: 'debt', label: 'Utang'}, {key: 'recurring', label: 'Rutin'}, {key: 'goal', label: 'Tujuan'}] as const} value={needFilter} onChange={setNeedFilter} />
    </ScrollView>
    <View style={[s.row, {gap: 10}]}>
      <View style={s.stat}>
        <Text style={s.mini}>Sudah disisihkan</Text>
        <RollingValue value={currency(projection.allocated)} bg={c.lime} containerStyle={{alignSelf: 'flex-start'}} style={s.number} />
        <Icon name="layers" />
      </View>
      <View style={[s.stat, {backgroundColor: c.ink}]}>
        <Text style={[s.mini, {color: '#B3BDA8'}]}>{working ? 'Target / hari kerja' : 'Bisa dipakai sekarang'}</Text>
        <RollingValue value={currency(working ? projection.requiredDaily : budget.safeNow)} bg={c.ink} containerStyle={{alignSelf: 'flex-start'}} style={[s.number, {color: c.white}]} />
        <Text style={[s.mini, {color: '#B3BDA8'}]}>{working ? `${projection.workdays} hari kerja dalam ${period} hari ke depan` : 'Setelah tagihan & kebutuhan'}</Text>
      </View>
    </View>
    <View style={s.section}>
      <PanelNotch />
      <SectionHead title="Belanja bulanan" action="Atur daftar" onPress={() => openShopping('edit')} />
      {state.shopping?.items.length ? <>
        <View>
          <Text style={s.mini}>{`${state.shopping.items.filter(i => !i.skip).length} barang · jadwal ${shortDate(shoppingDueDate(state, today))}`}</Text>
          <RollingValue value={currency(shoppingTotal(state.shopping))} bg={c.white} containerStyle={{alignSelf: 'flex-start', marginTop: 3}} style={[s.number, {fontSize: 24}]} />
          {state.shopping.lastDone && <Text style={s.mini}>Terakhir belanja {shortDate(state.shopping.lastDone)}</Text>}
        </View>
        <View style={{gap: 9}}>{state.shopping.items.slice(0, 5).map(item => <AnimatedPressable key={item.id} accessibilityLabel={`Ubah ${item.name}`} onPress={() => {openShopping('edit'); openShopItem(item);}} style={[s.row, {gap: 10}]}>
          <ShopThumb image={item.image} size={38} />
          <View style={{flex: 1, gap: 2}}><Marquee style={[s.body, item.skip && {color: c.muted}]}>{item.name}</Marquee><Text style={s.mini}>{item.skip ? 'Stok masih ada · skip bulan ini' : `${String(item.qty).replace('.', ',')} × ${currency(item.price)}`}</Text></View>
          <Text style={[s.body, {fontFamily: 'BarlowMedium', fontSize: 15}, item.skip && {color: c.muted}]}>{item.skip ? '–' : currency(Math.round(item.qty * item.price))}</Text>
        </AnimatedPressable>)}</View>
        {state.shopping.items.length > 5 && <AnimatedPressable accessibilityRole="button" onPress={() => openShopping('edit')} style={{paddingVertical: 4}}><Text style={[s.actionLabel, {textAlign: 'left'}]}>Lihat semua {state.shopping.items.length} barang ↗</Text></AnimatedPressable>}
        <Button title="Mulai belanja" icon="shopping-cart" onPress={() => openShopping('buy')} />
      </> : <>
        <Text style={s.muted}>Tulis daftar belanja rutin, misal beras, minyak, sabun. Totalnya otomatis masuk rencana kebutuhan tiap bulan.</Text>
        <Button title="Bikin daftar belanja" secondary icon="plus" onPress={() => openShopping('edit')} />
      </>}
    </View>
    <View style={s.section}>
      <PanelNotch />
      <SectionHead title="Token listrik" action="Buka" onPress={() => open('token')} />
      {electricity.purchases ? <View>
        <Text style={s.mini}>{electricity.costPerDay !== undefined ? `± ${currency(electricity.costPerDay)}/hari${electricity.nextPurchaseDate ? ` · perkiraan habis ${shortDate(electricity.nextPurchaseDate)}` : ''}` : 'Perkiraan muncul setelah 2 kali beli token'}</Text>
        <Text style={[s.number, {fontSize: 24, marginTop: 3}]}>{currency(electricity.typicalAmount)}</Text>
        {electricity.target && electricity.target.overBudget > 0 && <Text style={[s.mini, {color: c.red}]}>Lebih {currency(electricity.target.overBudget)} dari jatah bulanan</Text>}
      </View> : <Text style={s.muted}>Catat tiap beli token, DanaSiap perkirakan kapan habis dan berapa sebulan.</Text>}
      <Button title="Beli token / cek meteran" icon="zap" secondary={!electricity.purchases} onPress={() => open('token')} />
    </View>
    <View style={s.section}>
      <PanelNotch />
      <SectionHead title="Gas elpiji" action="Buka" onPress={() => open('gas')} />
      {gas.purchases ? <View>
        <Text style={s.mini}>{gas.daysPerCylinder !== undefined ? `1 tabung${gas.size !== undefined ? ` ${gasSizeText(gas.size)}` : ''} tahan ± ${gasDaysText(gas.daysPerCylinder)}${gas.nextPurchaseDate ? ` · perkiraan habis ${shortDate(gas.nextPurchaseDate)}` : ''}` : 'Perkiraan muncul setelah beli gas lagi'}</Text>
        <Text style={[s.number, {fontSize: 24, marginTop: 3}]}>{currency(gas.typicalAmount)}</Text>
        {gas.target && gas.target.overBudget > 0 && <Text style={[s.mini, {color: c.red}]}>Lebih {currency(gas.target.overBudget)} dari jatah gas per bulan</Text>}
      </View> : <Text style={s.muted}>Catat tiap beli gas, DanaSiap hitung 1 tabung tahan berapa lama dan kapan harus beli lagi.</Text>}
      <Button title="Beli gas" icon="thermometer" secondary={!gas.purchases} onPress={() => open('gas')} />
    </View>
    <GapCollapse visible={activeNeeds.length >= 5 || Boolean(needQuery)}><SearchField value={needQuery} onChange={setNeedQuery} placeholder="Cari kebutuhan…" /></GapCollapse>
    {/* Rows stay mounted and fold away (height springs), so filtering never makes the list jump. */}
    <View style={{marginTop: -16}}>{activeNeeds.map(n => (
      <Collapse key={n.id} visible={(needFilter === 'all' || n.kind === needFilter) && matches(needQuery, n.title)}><View style={{paddingTop: 16}}><Appear style={s.section}>
        {needRow(n)}
        <View style={s.between}>
          <Text style={s.mini}>{n.priority === 'essential' ? '● Kebutuhan penting' : '○ Jadwal fleksibel'}</Text>
          <AnimatedPressable onPress={() => {setEditingNeed(n); setRescheduleDate(n.dueDate); setAllocatedInput(formatThousands(n.saved)); setFormError('');}}>
            <Text style={s.actionLabel}>Atur rencana ↗</Text>
          </AnimatedPressable>
        </View>
      </Appear></View></Collapse>
    ))}</View>
    <GapCollapse visible={!activeNeeds.some(n => needFilter === 'all' || n.kind === needFilter)}>
      <View style={s.section}>
        <Empty text="Belum ada kebutuhan di sini. Mulai dari satu yang paling dekat." />
        <Button title="Tambah kebutuhan" onPress={() => open('need')} icon="plus" />
      </View>
    </GapCollapse>
    <GapCollapse visible={Boolean(needQuery.trim()) && activeNeeds.some(n => needFilter === 'all' || n.kind === needFilter) && !activeNeeds.some(n => (needFilter === 'all' || n.kind === needFilter) && matches(needQuery, n.title))}><NoMatch query={needQuery} /></GapCollapse>
    <Text style={[s.muted, {textAlign: 'center'}]}>Dana dialokasikan tetap bagian dari saldo.{`\n`}Bayar kebutuhan hanya dihitung sekali.</Text>
  </>;
  const monthStart = new Date(`${selectedDay.slice(0, 7)}-01T12:00:00+07:00`);
  const monthDays = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const monthDates = Array.from({length: monthDays}, (_, i) => `${selectedDay.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`);
  const selectedAttendance = state.attendance.find(a => a.date === selectedDay);
  const selectedHoliday = getHoliday(selectedDay);
  const selectedWorkday = isWorkday(state, selectedDay);
  const leftoverDates = new Set((state.leftovers ?? []).map(l => l.date));
  const selectedDaily = (state.dailyItems ?? []).filter(item => isScheduled(item, selectedDay) && selectedDay >= item.since);
  const dailyDay = (state.dailyItems ?? []).length ? <><View style={s.divider} /><Text style={s.fieldLabel}>PENGELUARAN HARIAN</Text>{selectedDaily.length ? selectedDaily.map(item => dailyEntry(item, selectedDay)) : <Text style={s.muted}>Nggak ada pengeluaran harian terjadwal di tanggal ini.</Text>}<Button title="Tandai libur panjang" secondary icon="sun" onPress={() => openSkip()} /></> : null;
  const renderCalendar = () => <><View><Text style={s.mini}>{working ? 'RITME KERJA, RITME UANG' : 'JADWAL & KEBUTUHAN'}</Text><Text style={[s.title, {fontSize: 33}]}>{working ? 'Kalender kerja' : 'Kalender'}</Text></View><View style={s.section}><View style={s.between}><AnimatedPressable accessibilityRole="button" accessibilityLabel="Bulan sebelumnya" onPress={() => setSelectedDay(addDays(selectedDay.slice(0, 7) + '-01', -1))}><Icon name="chevron-left" /></AnimatedPressable><Text style={s.heading}>{monthStart.toLocaleDateString('id-ID', {month: 'long', year: 'numeric'})}</Text><AnimatedPressable accessibilityRole="button" accessibilityLabel="Bulan berikutnya" onPress={() => setSelectedDay(addDays(selectedDay.slice(0, 7) + '-01', monthDays))}><Icon name="chevron-right" /></AnimatedPressable></View><View style={s.calendarGrid}>{weekdays.map(day => <View key={day} style={[s.dayCell, {marginBottom: 4}]}><View style={[s.day, {height: 24}]}><Text style={s.mini}>{day}</Text></View></View>)}{Array.from({length: monthStart.getDay()}, (_, i) => <View key={`blank-${i}`} style={s.dayCell} />)}{monthDates.map(date => {const a = state.attendance.find(a => a.date === date), work = isWorkday(state, date), hol = getHoliday(date); return <View key={date} style={s.dayCell}><AnimatedPressable accessibilityRole="button" accessibilityLabel={`${shortDate(date)}, ${hol ? hol + ', ' : ''}${working ? a?.status ?? (work ? 'jadwal kerja' : 'libur') : ''}`} onPress={() => setSelectedDay(date)} style={[s.day, date === selectedDay ? {backgroundColor: c.ink} : date === today ? {backgroundColor: c.lime} : hol ? {backgroundColor: '#FDF0EE', borderWidth: 1, borderColor: '#F5C2BC'} : working && (!work || a?.status === 'holiday') ? {backgroundColor: '#F4F6F0'} : {}]}><Text style={[s.body, date === selectedDay && {color: c.lime}, hol && date !== selectedDay && {color: '#C93B2B', fontWeight: 'bold'}, working && !work && !hol && date !== selectedDay && {color: c.muted}]}>{Number(date.slice(-2))}</Text><View style={[s.row, {gap: 2}]}>{a && working ? <View style={{width: 4, height: 4, marginTop: 3, borderRadius: 2, backgroundColor: a.status === 'absent' ? '#D98B66' : c.lime}} /> : hol ? <View style={{width: 4, height: 4, marginTop: 3, borderRadius: 2, backgroundColor: '#E86555'}} /> : null}{leftoverDates.has(date) && <View style={{width: 4, height: 4, marginTop: 3, borderRadius: 2, backgroundColor: '#6F9A2E'}} />}</View></AnimatedPressable></View>;})}</View><Text style={s.mini}>{working ? '● Hijau: tercatat  ·  ● Merah: tgl merah  ·  ● Oranye: tidak masuk  ·  Abu: libur  ·  ● Hijau tua: ada uang sisa' : '● Merah: tanggal merah  ·  ● Hijau tua: ada uang sisa'}</Text></View>
    {!working ? <View style={s.section}><SectionHead title={shortDate(selectedDay)} />{selectedHoliday && <Text style={s.body}>Tanggal Merah: {selectedHoliday}</Text>}{activeNeeds.some(n => n.dueDate === selectedDay) ? activeNeeds.filter(n => n.dueDate === selectedDay).map(n => needRow(n, true)) : <Text style={s.muted}>Tidak ada kebutuhan yang jatuh tempo di tanggal ini.</Text>}{dailyDay}</View> : <><View style={s.section}><SectionHead title={shortDate(selectedDay)} /><Text style={s.body}>{selectedAttendance?.planned ? 'Rencana kehadiran · belum dikonfirmasi' : selectedAttendance ? selectedAttendance.auto ? 'Masuk kerja · tercatat otomatis' : ({present: 'Sudah masuk kerja', absent: 'Tidak masuk', holiday: 'Libur terjadwal', half: 'Setengah hari'}[selectedAttendance.status]) : selectedHoliday ? `Tanggal Merah: ${selectedHoliday}` : selectedWorkday ? selectedDay > today ? 'Jadwal kerja · otomatis tercatat masuk di harinya' : 'Jadwal kerja · belum dicatat' : 'Hari libur · pemasukan diprediksi Rp0'}</Text><Text style={s.muted}>Pemasukan kerja: {currency(selectedAttendance?.income ?? (selectedWorkday ? state.profile.dailyIncome : 0))}</Text><Button title={selectedAttendance?.auto ? 'Tandai tidak masuk' : selectedAttendance?.planned ? 'Ubah rencana kehadiran' : selectedAttendance ? 'Ubah kehadiran' : 'Catat kehadiran'} onPress={() => open('attendance')} icon="check-circle" />{activeNeeds.filter(n => n.dueDate === selectedDay).map(n => needRow(n, true))}{dailyDay}</View>
    <Notice title="Kalau hari ini nggak masuk?" text={selectedDay < today ? 'Simulasi hanya untuk hari ini dan hari mendatang. Ubah catatan kehadiran untuk memperbaiki realisasi sebelumnya.' : !selectedWorkday ? 'Tanggal ini sudah dihitung sebagai libur. Tidak ada pemasukan kerja yang dikurangi.' : `Prediksi kekurangan menjadi ${currency(absence.shortfall)}${absence.shortfall > projection.shortfall ? `, bertambah ${currency(absence.shortfall - projection.shortfall)}` : ''}. Lihat dampak sebelum mencatat.`} icon="activity" />
    <Button title="Atur hari kerja & pemasukan" secondary onPress={() => open('setup')} icon="sliders" /></>}
  </>;
  const expenseTotal = state.transactions.filter(t => t.type === 'expense' && t.date <= today).reduce((sum, t) => sum + t.amount, 0);
  const incomeTotal = state.transactions.filter(t => t.type === 'income' && t.date <= today).reduce((sum, t) => sum + t.amount, 0);
  const bars = projection.days.filter((_, i) => i % Math.max(1, Math.floor(period / 7)) === 0).slice(0, 7);
  const maxBar = Math.max(1, ...bars.map(d => Math.abs(d.balance)));
  const renderInsights = () => <><View style={s.between}><AnimatedPressable onPress={() => switchTab('home')} accessibilityLabel="Kembali ke beranda" style={s.circle}><Icon name="arrow-left" /></AnimatedPressable><Text style={s.title}>Statistik</Text><AnimatedPressable onPress={() => open('settings')} accessibilityLabel="Pengaturan" style={s.circle}><Icon name="more-horizontal" /></AnimatedPressable></View><SegmentPills style={{justifyContent: 'space-between'}} options={[{key: 7, label: '7 hari'}, {key: 14, label: '14 hari'}, {key: 30, label: '30 hari'}, {key: 90, label: '90 hari'}]} value={period} onChange={setPeriod} /><View style={[s.row, {gap: 12}]}><View style={s.stat}><View style={s.between}><Text style={s.mini}>↗ Pemasukan aktual</Text><Icon name="more-horizontal" size={17} /></View><RollingValue value={currency(incomeTotal)} bg={c.lime} containerStyle={{alignSelf: 'flex-start'}} style={s.number} /><Text style={s.mini}>Total yang sudah dicatat</Text><View style={[s.progress, {marginTop: 13, backgroundColor: '#DBF2A0'}]}><View style={[s.progressFill, {width: `${incomeTotal ? Math.max(0, Math.min(100, (incomeTotal - expenseTotal) / incomeTotal * 100)) : 0}%`, backgroundColor: c.white}]} /></View></View><View style={[s.stat, {backgroundColor: c.ink}]}><View style={s.between}><Text style={[s.mini, {color: '#D0DBC2'}]}>↗ Pengeluaran aktual</Text><Icon name="more-horizontal" size={17} color={c.lime} /></View><RollingValue value={currency(expenseTotal)} bg={c.ink} containerStyle={{alignSelf: 'flex-start'}} style={[s.number, {color: c.white}]} /><Svg width="100%" height="58" viewBox="0 0 150 58"><Path d="M10 45 L38 15 L65 37 L98 8 L137 40 L10 45 M38 15 L98 8 L65 37 L137 40 M10 45 L98 8" fill="none" stroke={c.lime} strokeWidth=".8" /></Svg></View></View><View style={s.section}><PanelNotch /><SectionHead title="Arah saldo kamu" /><View style={s.between}><View><Text style={s.mini}>Prediksi saldo akhir</Text><RollingValue value={currency(projection.projectedBalance)} bg={c.white} containerStyle={{alignSelf: 'flex-start'}} style={s.number} /></View><View style={{gap: 5}}><Text style={s.mini}>■ Hijau: tersedia</Text><Text style={s.mini}>■ Gelap: defisit</Text></View></View><View style={{height: 171, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', borderBottomWidth: 1, borderColor: c.line}}>{bars.map(d => <View key={d.date} style={{alignItems: 'center', width: '12%', justifyContent: 'flex-end', height: '100%'}}><View style={{height: Math.max(8, Math.abs(d.balance) / maxBar * 126), width: 21, backgroundColor: d.balance < 0 ? c.ink : c.lime, borderRadius: 3, overflow: 'hidden'}}>{Array.from({length: 8}, (_, i) => <View key={i} style={{position: 'absolute', height: 3, backgroundColor: c.white, width: '100%', bottom: i * 18}} />)}</View><Text style={[s.mini, {fontSize: 9, marginTop: 10, marginBottom: 8}]}>{shortDate(d.date)}</Text></View>)}</View><Text style={s.muted}>Perkiraan {period} hari, mengikuti {working ? 'jadwal kerja, ' : ''}kebutuhan, dan anggaran harianmu. Bukan pemasukan yang sudah diterima.</Text></View>
    {projection.risks.map((r, i) => <Notice key={`${r.needId}-${i}`} title={`${r.title} · ${shortDate(r.date)}`} text={`Diprediksi kurang ${currency(r.shortfall)}. ${working ? 'Tinjau pengeluaran dan hari kerja yang tersisa.' : 'Tinjau pengeluaran atau catat uang masuk.'}`} icon="alert-circle" />)}
    <View style={s.section}><SectionHead title="Semua transaksi" />
      <GapCollapse gap={13} visible={transactions.length >= 5 || Boolean(txQuery)}><SearchField value={txQuery} onChange={setTxQuery} placeholder="Cari transaksi…" /></GapCollapse>
      {transactions.length ? <View style={{marginTop: -13}}>{transactions.map(t => <Collapse key={t.id} visible={matches(txQuery, t.title, t.category)}><View style={[s.between, {paddingTop: 13 + 7, paddingBottom: 7, gap: 15}]}><View style={{flex: 1, gap: 3}}><Marquee style={s.listTitle}>{t.title}</Marquee><Text style={s.mini}>{shortDate(t.date)} · {t.category}</Text></View><Text style={s.amount}>{t.type === 'income' ? '+' : '−'}{currency(t.amount)}</Text></View></Collapse>)}</View> : <Empty text="Belum ada transaksi yang dicatat." />}
      <GapCollapse gap={13} visible={Boolean(txQuery.trim()) && transactions.length > 0 && !transactions.some(t => matches(txQuery, t.title, t.category))}><NoMatch query={txQuery} /></GapCollapse>
    </View>
  </>;

  // An item form open inside a sheet (shopping item, daily item): the header button goes back to the list.
  const subForm = (sheet === 'shopping' && shopMode === 'item' && Boolean(shopForm)) || (sheet === 'setup' && Boolean(dailyForm));
  const sheetTitle = sheet === 'shopping' ? (shopMode === 'buy' ? 'Lagi belanja' : shopMode === 'item' ? (shopForm?.isNew ? 'Tambah barang' : 'Ubah barang') : 'Belanja bulanan')
    : sheet === 'setup' ? (dailyForm ? (dailyForm.isNew ? 'Tambah pengeluaran harian' : 'Ubah pengeluaran harian') : started ? 'Profil & pengaturan' : 'Kenalan dulu, yuk.')
    : ({expense: 'Catat pengeluaran', income: 'Catat pemasukan', need: 'Bikin rencana baru', attendance: 'Kehadiran kerja', settings: 'Ruang pribadi', cloud: 'Sinkron perangkat', backup: 'Pulihkan cadangan', daily: 'Ada uang sisa?', leftover: 'Uang Sisa', check: 'Cek sebelum beli', token: 'Token listrik', gas: 'Gas elpiji', skip: 'Libur panjang'} as Record<string, string>)[sheet ?? 'expense'];
  const navBottom = Math.max(insets.bottom, 16);
  const toastHost = editingNeed ? 'need' : sheet !== null ? 'sheet' : 'main';
  const modalToastBottom = keyboardHeight > 0 ? keyboardHeight + 12 : navBottom + 8;
  const closeToast = () => setToast(null);

  return <View style={s.screen}>{started ?<SafeAreaView style={s.fill} edges={['top', 'left', 'right']}><Veiled veil={screenVeil} bg={c.pale} provide style={s.fill} targetStyle={s.fill}><Grid /><ScrollView contentContainerStyle={[s.content, {paddingBottom: 110 + insets.bottom}]} showsVerticalScrollIndicator={false}>{storageError && <Notice title="Periksa penyimpanan" text={storageError} icon="alert-circle" />}<CrossBlur k={tab} style={{gap: 16}}><View style={{gap: 16}}>{tab === 'home' ? renderHome() : tab === 'needs' ? renderNeeds() : tab === 'calendar' ? renderCalendar() : renderInsights()}</View></CrossBlur></ScrollView></Veiled><MorphNav tab={tab} bottom={navBottom} homeRef={homeNavRef} onTab={switchTab} onAction={action => setTimeout(() => open(action), 120)} /></SafeAreaView> : welcome}
    <FlyLayer />
    <DialogHost />
    <Toast toast={toastHost === 'main' ? toast : null} bottom={started ? navBottom + 60 + 12 : navBottom + 12} onClose={closeToast} />
    <SheetModal visible={sheet !== null} onRequestClose={() => backSheet()} onBackdropPress={() => closeSheet()} backdropStyle={keyboardHeight > 0 && {paddingBottom: keyboardHeight}} panelStyle={[s.modal, {paddingBottom: keyboardHeight > 0 ? 16 : Math.max(insets.bottom, 22), maxHeight: keyboardHeight > 0 ? Math.max(280, windowHeight - keyboardHeight - (insets.top || 24) - 16) : '91%'}]} overlay={<Toast toast={toastHost === 'sheet' ? toast : null} bottom={modalToastBottom} onClose={closeToast} />}><View style={[s.between, {marginBottom: 13, gap: 12}]}><CrossBlur k={sheetTitle} mode="left" style={{flex: 1}}><Marquee style={s.title}>{sheetTitle}</Marquee></CrossBlur><AnimatedPressable accessibilityLabel={subForm ? 'Kembali ke daftar' : 'Tutup'} onPress={() => subForm ? backSheet(true) : closeSheet(true)} style={s.circle}><CrossBlur k={subForm ? 'back' : 'close'}><Icon name={subForm ? 'arrow-left' : 'x'} /></CrossBlur></AnimatedPressable></View><ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom: 28}}><CrossBlur animateHeight k={`${sheet === 'income' ? 'expense' : sheet}:${sheet === 'shopping' ? shopMode : subForm ? 'item' : ''}`} parentVeil>
      {(sheet === 'expense' || sheet === 'income' || sheet === 'need') && <>
        {sheet !== 'need' && <SegmentPills style={{gap: 8}} options={[{key: 'expense', label: 'Uang keluar'}, {key: 'income', label: 'Uang masuk'}] as const} value={sheet === 'income' ? 'income' : 'expense'} onChange={setSheet} />}
        <Collapse visible={sheet === 'income' && working}><Text style={[s.muted, {marginTop: 10}]}>{state.profile.payrollCycle === 'monthly' ? "Pemasukan kerja dicatat dari absensi. Jika mencatat gaji yang sudah cair, sertakan kata ‘gaji’ di namanya agar prediksi tidak menghitung dua kali." : 'Pemasukan kerja dicatat otomatis dari absensi. Gunakan ini untuk pemasukan lain.'}</Text></Collapse>
        <Field label={sheet === 'need' ? 'NAMA KEBUTUHAN' : 'UNTUK APA?'} value={form.title} onChange={title => setForm({...form, title})} placeholder={sheet === 'need' ? 'Misal: bensin motor' : 'Misal: makan siang'} />
        <Field label="NOMINAL (RP)" value={form.amount} onChange={amount => setForm({...form, amount})} placeholder="25000" numeric />
        <Field label={sheet === 'need' ? 'TANGGAL DIBUTUHKAN (YYYY-MM-DD)' : 'TANGGAL (YYYY-MM-DD)'} value={form.date} onChange={date => setForm({...form, date})} />
        {sheet !== 'need' && <SegmentPills style={{marginTop: 7, marginBottom: 3}} options={[{key: today, label: 'Hari ini'}, {key: addDays(today, -1), label: 'Kemarin'}, {key: addDays(today, -2), label: '2 hari lalu'}]} value={form.date} onChange={date => setForm({...form, date})} />}
        <Collapse visible={sheet === 'expense'}><Text style={[s.fieldLabel, {marginTop: 17, marginBottom: 10}]}>KATEGORI</Text><SegmentPills wrap options={['Makan', 'Transportasi', 'Belanja', 'Mendadak', 'Lainnya'].map(key => ({key, label: key}))} value={form.category} onChange={category => setForm({...form, category})} /></Collapse>
        {sheet === 'need' && <><Text style={[s.fieldLabel, {marginTop: 17, marginBottom: 10}]}>JENIS KEBUTUHAN</Text><SegmentPills options={[{key: 'recurring', label: 'Rutin'}, {key: 'debt', label: 'Utang'}, {key: 'goal', label: 'Tujuan'}]} value={form.kind} onChange={kind => setForm({...form, kind})} /><Collapse visible={Boolean(form.kind === 'recurring')}>{<Field label="BERULANG SETIAP (HARI KALENDER)" value={form.interval} onChange={interval => setForm({...form, interval})} numeric />}</Collapse><Field label="SUDAH DIALOKASIKAN DARI SALDO (RP)" value={form.saved} onChange={saved => setForm({...form, saved})} numeric /><Text style={[s.muted, {marginTop: 5}]}>Alokasi ini bagian dari saldo yang ada, bukan pemasukan tambahan.</Text><SegmentPills style={{marginTop: 15}} options={[{key: 'essential', label: 'Penting'}, {key: 'flexible', label: 'Fleksibel'}]} value={form.priority} onChange={priority => setForm({...form, priority})} /></>}
        <Collapse visible={sheet === 'expense'}>{(() => {const plan = leftoverPlan(number(form.amount || '0')); return <>
          {plan.available && <View style={[s.row, {marginTop: 15, flexWrap: 'wrap'}]}><Chip label={`${plan.on ? '✓ ' : ''}Ambil dari Uang Sisa (${currency(Math.max(0, budget.leftoverPot))})`} active={plan.on} onPress={() => setUseLeftover(!plan.on)} /></View>}
          {plan.on && plan.from > 0 && <Text style={[s.muted, {marginTop: 6}]}>{currency(plan.from)} diambil dari Uang Sisa, sisanya dari jatah.</Text>}
          {plan.hint ? <Text style={[s.muted, {marginTop: 6}, (plan.hint.startsWith('Uang untuk tagihan') || plan.hint.startsWith('Uangnya belum')) && {color: c.red}]}>{plan.hint}</Text> : null}
        </>;})()}</Collapse>
        <Collapse visible={sheet === 'income' && budget.daysLeft <= 3}><View style={[s.row, {marginTop: 15, flexWrap: 'wrap'}]}><Chip label={`${(forNextPeriod ?? true) ? '✓ ' : ''}Untuk bulan baru (mulai ${shortDate(addDays(budget.end, 1))})`} active={forNextPeriod ?? true} onPress={() => setForNextPeriod(!(forNextPeriod ?? true))} /></View></Collapse>
        {sheet === 'income' && (forNextPeriod ?? true) && budget.daysLeft <= 3 && <Text style={[s.muted, {marginTop: 6}]}>Uangnya disimpan dulu dan baru dihitung ke jatah jajan mulai {shortDate(addDays(budget.end, 1))}.</Text>}
        {formError && <Text style={s.error}>{formError}</Text>}<View style={{marginTop: 23}}><Button title={sheet === 'need' ? 'Simpan rencana' : 'Simpan transaksi'} onPress={saveForm} icon="check" /></View>
      </>}
      {sheet === 'setup' && !dailyForm && <><Text style={s.muted}>{profile.working ? 'DanaSiap menghitung tabungan hanya di hari kamu kerja. Semua nominal dalam rupiah.' : 'Catat uang masuk dan keluar, DanaSiap bantu jaga kebutuhanmu. Semua nominal dalam rupiah.'}</Text>
        <View style={[s.row, {gap: 13, alignItems: 'center', marginTop: 14, marginBottom: 4}]}>
          <View style={[s.avatar, {width: 48, height: 48, borderRadius: 24, overflow: 'hidden'}]}>
            {profile.avatarUrl ? <Image source={{uri: profile.avatarUrl}} style={{width: 48, height: 48}} /> : <Text style={[s.avatarText, {fontSize: 22}]}>{(profile.name || 'D').slice(0, 1).toUpperCase()}</Text>}
          </View>
          <View style={[s.row, {gap: 8, flex: 1}]}>
            <View style={{flex: 1}}><Button title={profile.avatarUrl ? 'Ganti foto' : 'Pilih foto'} secondary icon="camera" onPress={pickAvatar} /></View>
            {Boolean(profile.avatarUrl) && <View style={{flex: 1}}><Button title="Hapus foto" secondary icon="trash-2" onPress={removeAvatar} /></View>}
          </View>
        </View>
        <Field label="NAMA PANGGILAN" value={profile.name} onChange={name => setProfile({...profile, name})} placeholder="Nama kamu" /><Text style={[s.fieldLabel, {marginTop: 15, marginBottom: 8}]}>APAKAH KAMU BEKERJA?</Text><SegmentPills style={{gap: 8}} options={[{key: 'yes', label: 'Bekerja'}, {key: 'no', label: 'Tidak bekerja'}] as const} value={profile.working ? 'yes' : 'no'} onChange={v => setProfile({...profile, working: v === 'yes'})} /><Collapse visible={Boolean(!profile.working)}>{<Text style={[s.muted, {marginTop: 6}]}>Absensi, gajian, dan hari kerja disembunyikan. Pemasukan dicatat lewat Uang masuk.</Text>}</Collapse><Field label="SALDO AWAL (RP)" value={profile.openingBalance} onChange={openingBalance => setProfile({...profile, openingBalance})} placeholder="Saldo sebelum transaksi yang dicatat" numeric /><Collapse visible={Boolean(profile.working)}>{<><Field label={profile.payrollCycle === 'monthly' ? "UPAH POKOK / HARI KERJA (RP)" : "PEMASUKAN PER HARI KERJA (RP)"} value={profile.dailyIncome} onChange={dailyIncome => setProfile({...profile, dailyIncome})} placeholder="70000" numeric /><Text style={[s.fieldLabel, {marginTop: 15, marginBottom: 8}]}>SISTEM PENERIMAAN GAJI</Text><SegmentPills style={{gap: 8}} options={[{key: 'daily', label: 'Harian'}, {key: 'monthly', label: 'Bulanan (Payroll)'}] as const} value={profile.payrollCycle} onChange={payrollCycle => setProfile({...profile, payrollCycle})} /><Collapse visible={Boolean(profile.payrollCycle === 'monthly')}>{<Field label="TANGGAL GAJIAN BULANAN (1-28)" value={profile.payday} onChange={payday => setProfile({...profile, payday})} placeholder="5" numeric />}</Collapse><Field label="TUNJANGAN AKTIVITAS (UANG SAKU CASH / HARI AKTIF)" value={profile.activityAllowance} onChange={activityAllowance => setProfile({...profile, activityAllowance})} placeholder="0" numeric /><Text style={[s.muted, {marginTop: 4}]}>Diberikan cash langsung di tangan pada hari aktif. Libur = Rp 0.</Text></>}</Collapse><Field label="SEBULAN MULAI TANGGAL (1-28)" value={profile.periodStartDay} onChange={periodStartDay => setProfile({...profile, periodStartDay})} placeholder="1" numeric /><Text style={[s.muted, {marginTop: 6}]}>Isi tanggal uang bulananmu biasanya masuk (gajian atau transferan). Misal masuk tanggal 25, isi 25: jatah dihitung dari tanggal 25 sampai 24 bulan berikutnya.</Text>{profile.working && profile.payrollCycle === 'monthly' && Number(profile.periodStartDay || '1') !== Number(profile.payday || '5') && <Text style={[s.muted, {marginTop: 4, color: c.red}]}>Tanggal gajianmu {profile.payday || '5'}. Samakan supaya gaji langsung dihitung untuk bulan itu.</Text>}
        <Text style={[s.fieldLabel, {marginTop: 19, marginBottom: 4}]}>PENGELUARAN HARIAN</Text><Text style={s.muted}>Tercatat otomatis tiap hari terjadwal. Tandai kalau nggak dipakai. Contoh: ongkos anak, uang masak. Kebutuhan berkala (ganti oli, kuota, dll.) dicatat di Rencana Kebutuhan.</Text>
        <View style={[s.section, {marginTop: 12, gap: 0, paddingVertical: 6}]}>
          {dailyDraft.length ? dailyDraft.map((item, i) => <AnimatedPressable key={item.id} accessibilityLabel={`Ubah ${item.title.trim() || 'pengeluaran harian'}`} onPress={() => openDailyItem(item)} style={[s.row, {gap: 11, paddingVertical: 10}, i > 0 && {borderTopWidth: 1, borderColor: '#EEF1E9'}]}>
            <View style={s.needIcon}><Icon name="repeat" size={16} /></View>
            <View style={{flex: 1, gap: 3}}><Marquee style={s.listTitle}>{item.title.trim() || 'Tanpa nama'}</Marquee><Marquee style={s.mini}>{`${daysText(item.days)}${item.skipHolidays ? ' · libur di tanggal merah' : ''}`}</Marquee></View>
            <Text style={[s.body, {fontFamily: 'BarlowMedium', fontSize: 15}]}>{currency(number(item.amount || '0'))}</Text>
            <Icon name="chevron-right" size={16} color={c.muted} />
          </AnimatedPressable>) : <Text style={[s.muted, {paddingVertical: 10}]}>Belum ada. Contoh: ongkos anak, uang masak.</Text>}
        </View>
        <View style={{marginTop: 12}}><Button title="Tambah pengeluaran harian" secondary icon="plus" onPress={() => openDailyItem()} /></View><Collapse visible={Boolean(profile.working)}>{<><Text style={[s.fieldLabel, {marginTop: 19, marginBottom: 10}]}>BIASANYA KERJA HARI APA?</Text><View style={[s.row, {flexWrap: 'wrap', gap: 6}]}>{weekdays.map((day, i) => <Chip key={day} label={day} active={profile.workDays.includes(i)} onPress={() => setProfile({...profile, workDays: profile.workDays.includes(i) ? profile.workDays.filter(d => d !== i) : [...profile.workDays, i]})} />)}</View><Text style={[s.muted, {marginTop: 10}]}>Tanggal merah mengikuti pilihanmu. Tandai libur tambahan lewat kalender.</Text></>}</Collapse>{formError && <Text style={s.error}>{formError}</Text>}<View style={{marginTop: 23}}><Button title={started ? 'Simpan pengaturan' : 'Siap, mulai rencanakan'} onPress={saveProfile} icon="arrow-up-right" /></View></>}
      {sheet === 'setup' && dailyForm && (() => {
        const f = dailyForm;
        const exists = dailyDraft.some(d => d.id === f.id);
        return <>
          <Text style={s.muted}>Tercatat otomatis sebagai pengeluaran di hari yang dipilih. Kalau suatu hari nggak dipakai, tandai di Beranda.</Text>
          <Field label="NAMA" value={f.title} onChange={title => editDailyForm({title})} placeholder="Misal: Ongkos Anak A" />
          <Field label="NOMINAL PER HARI (RP)" value={f.amount} onChange={amount => editDailyForm({amount})} placeholder="50.000" numeric />
          <Text style={[s.fieldLabel, {marginTop: 16, marginBottom: 8}]}>HARI</Text>
          <View style={[s.row, {flexWrap: 'wrap', gap: 6}]}>{weekdays.map((day, i) => <Chip key={day} label={day} active={f.days.includes(i)} onPress={() => editDailyForm({days: f.days.includes(i) ? f.days.filter(d => d !== i) : [...f.days, i]})} />)}</View>
          <View style={[s.row, {marginTop: 10}]}><Chip label={f.skipHolidays ? '✓ Libur di tanggal merah' : 'Tetap jalan di tanggal merah'} active={f.skipHolidays} onPress={() => editDailyForm({skipHolidays: !f.skipHolidays})} /></View>
          {formError && <Text style={s.error}>{formError}</Text>}
          <View style={{gap: 6, marginTop: 23}}>
            <Button title="Simpan" icon="check" onPress={() => saveDailyForm('list')} />
            {exists ? <AnimatedPressable accessibilityRole="button" accessibilityLabel="Hapus pengeluaran harian ini" onPress={deleteDailyItem} style={[s.row, {gap: 7, alignSelf: 'center', padding: 12}]}><Icon name="trash-2" size={15} color={c.red} /><Text style={[s.actionLabel, {color: c.red}]}>Hapus pengeluaran</Text></AnimatedPressable>
              : <AnimatedPressable accessibilityRole="button" onPress={() => leaveDailyForm('list')} style={{alignSelf: 'center', padding: 12}}><Text style={s.actionLabel}>Batal</Text></AnimatedPressable>}
          </View>
        </>;
      })()}
      {sheet === 'daily' && (() => {
        const item = (state.dailyItems ?? []).find(i => i.id === leftoverTarget?.itemId);
        if (!item || !leftoverTarget) return <Text style={s.muted}>Pengeluaran harian tidak ditemukan.</Text>;
        const amount = number(leftoverInput || '0');
        return <>
          <Text style={s.muted}>{item.title} · {shortDate(leftoverTarget.date)} · rencana {currency(item.amount)}. Isi uang yang nggak kepakai, nanti masuk Uang Sisa.</Text>
          <Field label="UANG YANG NGGAK KEPAKAI (RP)" value={leftoverInput} onChange={setLeftoverInput} placeholder="20.000" numeric />
          <SegmentPills wrap stagger style={{marginTop: 11}} options={[{key: 'all', label: 'Semua'}, {key: 'half', label: 'Separuh'}, {key: 'none', label: 'Nggak ada sisa'}] as const} value={amount === item.amount ? 'all' : amount > 0 && amount === Math.floor(item.amount / 2) ? 'half' : amount === 0 ? 'none' : null} onChange={v => setLeftoverInput(v === 'all' ? formatThousands(item.amount) : v === 'half' ? formatThousands(Math.floor(item.amount / 2)) : '')} />
          <Collapse visible={amount > 0 && amount <= item.amount}><Appear visible={amount > 0 && amount <= item.amount}><Text style={[s.muted, {marginTop: 10}]}>Terpakai {currency(item.amount - amount)} · +{currency(amount)} ke Uang Sisa.</Text></Appear></Collapse>
          {formError && <Text style={s.error}>{formError}</Text>}
          <View style={{marginTop: 23}}><Button title="Simpan sisa" onPress={e => saveDailyLeftover(e)} icon="check" /></View>
        </>;
      })()}
      {sheet === 'leftover' && <View style={{gap: 12}}>
        <RollingValue value={currency(heldPot ?? Math.max(0, budget.leftoverPot))} bg={c.pale} containerStyle={{alignSelf: 'flex-start'}} style={[s.number, {fontSize: 34}]} />
        <Text style={s.muted}>Uang yang nggak jadi dipakai dari {shortDate(budget.start)} – {shortDate(budget.end)}, misal ongkos saat anak libur. Uangnya tetap di tanganmu, dipisah dari jatah jajan.</Text>
        <Button title="Pakai Uang Sisa" icon="arrow-up-right" disabled={budget.leftoverPot <= 0} onPress={() => {open('expense'); setUseLeftover(true);}} />
        <View style={s.section}>
          <SectionHead title="Bulan ini" />
          {budget.leftovers.length ? budget.leftovers.map(l => <Appear key={l.id} style={[s.between, {gap: 12}]}><View style={{flex: 1, gap: 3}}><Marquee style={s.listTitle}>{l.title}</Marquee><Text style={s.mini}>{shortDate(l.date)}</Text></View><Text style={s.amount}>+{currency(l.amount)}</Text></Appear>) : <Text style={s.muted}>Belum ada uang sisa bulan ini.</Text>}
          {budget.leftoverUsed > 0 && <><View style={s.divider} /><View style={s.between}><Text style={s.listTitle}>Sudah dipakai</Text><Text style={s.amount}>−{currency(budget.leftoverUsed)}</Text></View></>}
        </View>
        <View style={s.section}>
          <SectionHead title="Bulan-bulan sebelumnya" />
          {history.length ? history.map(h => <View key={h.start} style={{gap: 3}}><View style={[s.between, {gap: 12}]}><Text style={[s.listTitle, {flex: 1}]}>Sisa {shortDate(h.start)} – {shortDate(h.end)}</Text><Text style={s.amount}>{currency(h.leftover)}</Text></View><Text style={s.mini}>Uang di akhir bulan itu {currency(h.endingMoney)}</Text></View>) : <Text style={s.muted}>Riwayat muncul setelah bulan pertama selesai.</Text>}
        </View>
      </View>}
      {sheet === 'check' && (() => {
        const amount = number(checkAmount || '0');
        const result = amount > 0 ? checkPurchase(budget, amount) : null;
        const notice = !result ? null : result.verdict === 'jatah' ? {title: 'Aman', text: 'Aman, masih masuk jatah hari ini.', icon: 'check-circle' as IconName}
          : result.verdict === 'sisa' ? {title: 'Aman pakai Uang Sisa', text: `Aman: ${result.fromAllowance > 0 ? `${currency(result.fromAllowance)} dari jatah hari ini + ` : ''}${currency(result.fromLeftover)} dari Uang Sisa (Uang Sisa tinggal ${currency(result.leftoverAfter)}).`, icon: 'archive' as IconName}
          : result.verdict === 'turun' ? {title: 'Bisa, tapi hati-hati', text: `Bisa, tapi jatah jajan turun jadi ${currency(result.perDayAfter)}/hari sampai ${shortDate(budget.end)}.`, icon: 'trending-down' as IconName}
          : {title: 'Jangan dulu', text: result.cashShort > 0 ? `Jangan dulu, uangnya belum ada. Yang bisa dipakai sekarang ${currency(result.cashNow)}.` : `Jangan dulu, uang untuk tagihan jadi kurang ${currency(result.shortfall)}.`, icon: 'alert-octagon' as IconName};
        return <>
          <Text style={s.muted}>Jatah jajan hari ini {currency(Math.max(0, budget.leftToday))}{budget.leftoverPot > 0 ? ` · Uang Sisa ${currency(budget.leftoverPot)}` : ''}.</Text>
          <Field label="HARGA BARANG (RP)" value={checkAmount} onChange={setCheckAmount} placeholder="50.000" numeric />
          <Collapse visible={Boolean(notice)}><Appear visible={Boolean(notice)} bg={c.pale} radius={18} style={{marginTop: 16}}>{notice && <CrossBlur k={notice.title}><PopIn trigger={notice.title}><Notice title={notice.title} text={notice.text} icon={notice.icon} /></PopIn></CrossBlur>}</Appear></Collapse>
          {result && result.verdict !== 'bahaya' && <Appear style={{marginTop: 16}}><Button title="Jadi beli, catat pengeluaran" icon="arrow-up-right" onPress={() => {const value = checkAmount; open('expense'); setForm(f => ({...f, amount: value}));}} /></Appear>}
        </>;
      })()}
      {sheet === 'shopping' && shopMode === 'edit' && (() => {
        const items = state.shopping?.items ?? [];
        const anyMatch = items.some(item => matches(shopQuery, item.name));
        return <>
          <View style={[s.section, {gap: 10}]}>
            <View style={[s.between, {alignItems: 'flex-end', gap: 12}]}>
              <View style={{flex: 1, gap: 2}}>
                <Text style={s.mini}>{`Total ${items.filter(i => !i.skip).length} barang bulan ini`}</Text>
                <RollingValue value={currency(shoppingTotal(state.shopping))} bg={c.white} containerStyle={{alignSelf: 'flex-start'}} style={[s.number, {fontSize: 28}]} />
              </View>
              {state.shopping?.lastDone ? <Text style={[s.mini, {textAlign: 'right'}]}>{`Terakhir belanja\n${shortDate(state.shopping.lastDone)}`}</Text> : null}
            </View>
            <View style={s.divider} />
            <AnimatedPressable accessibilityRole="button" accessibilityLabel="Atur tanggal belanja" accessibilityState={{expanded: shopDayOpen}} onPress={() => setShopDayOpen(!shopDayOpen)} style={[s.row, {gap: 11}]}>
              <View style={s.needIcon}><Icon name="calendar" size={16} /></View>
              <View style={{flex: 1, gap: 3}}><Text style={s.listTitle}>Atur tanggal belanja</Text><Marquee style={s.mini}>{`Tiap tanggal ${shopDueDay}${items.length ? ` · berikutnya ${shortDate(shoppingDueDate(state, today))}` : ''}`}</Marquee></View>
              <CrossBlur k={shopDayOpen ? 'up' : 'down'}><Icon name={shopDayOpen ? 'chevron-up' : 'chevron-down'} size={17} color={c.muted} /></CrossBlur>
            </AnimatedPressable>
            <Collapse visible={shopDayOpen}><View style={{gap: 8, paddingBottom: 4}}>
              <Text style={s.muted}>Belanja bulanan biasanya tanggal berapa?</Text>
              <SegmentPills wrap style={{gap: 6}} options={Array.from({length: 28}, (_, i) => ({key: i + 1, label: String(i + 1)}))} value={shopDueDay} onChange={setShopDay} />
            </View></Collapse>
            <Button title="Mulai belanja" icon="shopping-cart" disabled={!items.some(i => !i.skip)} onPress={startBuying} />
          </View>
          <Collapse visible={items.length >= 5 || Boolean(shopQuery)}><View style={{marginTop: 12}}><SearchField value={shopQuery} onChange={setShopQuery} placeholder="Cari barang…" /></View></Collapse>
          <View style={[s.section, {marginTop: 12, gap: 0, paddingVertical: 6}]}>
            {items.length ? items.map(item => <Collapse key={item.id} visible={matches(shopQuery, item.name)}>
              <AnimatedPressable accessibilityLabel={`Ubah ${item.name}`} onPress={() => openShopItem(item)} style={[s.row, {gap: 10, paddingVertical: 9}]}>
                <ShopThumb image={item.image} />
                <View style={{flex: 1, gap: 3}}>
                  <Marquee style={[s.listTitle, item.skip && {color: c.muted}]}>{item.name}</Marquee>
                  <CrossBlur k={item.skip ? 'skip' : 'buy'} variant="value"><Marquee style={s.mini}>{item.skip ? 'Stok masih ada · skip bulan ini' : `${String(item.qty).replace('.', ',')} × ${currency(item.price)}`}</Marquee></CrossBlur>
                </View>
                <RollingValue value={item.skip ? '–' : currency(Math.round(item.qty * item.price))} align="right" containerStyle={{minWidth: 64, alignItems: 'flex-end'}} style={[s.body, {fontFamily: 'BarlowMedium', fontSize: 15}, item.skip && {color: c.muted}]} />
                <SkipChip on={Boolean(item.skip)} onPress={() => toggleShopSkip(item.id)} />
              </AnimatedPressable>
            </Collapse>) : <Empty text="Belum ada barang. Tambahkan beras, minyak, sabun, dan kebutuhan dapur lainnya." />}
            <Collapse visible={items.length > 0 && !anyMatch}><NoMatch query={shopQuery} /></Collapse>
          </View>
          <View style={{marginTop: 14}}><Button title="Tambah barang" secondary icon="plus" onPress={() => openShopItem()} /></View>
          <Text style={[s.muted, {marginTop: 12}]}>Ketuk barang untuk ubah jumlah, harga, atau foto. Ketuk "Skip" kalau stoknya masih ada bulan ini. Totalnya otomatis masuk rencana kebutuhan.</Text>
        </>;
      })()}
      {sheet === 'shopping' && shopMode === 'item' && shopForm && (() => {
        const f = shopForm;
        const exists = (state.shopping?.items ?? []).some(i => i.id === f.id);
        return <>
          <View style={[s.row, {gap: 14}]}>
            <AnimatedPressable accessibilityRole="button" accessibilityLabel={f.image ? 'Ganti foto barang' : 'Tambah foto barang'} onPress={() => chooseShopImage(f.id)} style={{width: 72, height: 72, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderStyle: f.image ? 'solid' : 'dashed', borderColor: '#C9D5B4', backgroundColor: '#F6F9EF', alignItems: 'center', justifyContent: 'center'}}>
              {f.image ? <Image source={{uri: f.image}} style={{width: 72, height: 72}} /> : <Icon name="camera" size={22} color={c.muted} />}
            </AnimatedPressable>
            <View style={{flex: 1, gap: 8, alignItems: 'flex-start'}}>
              <Text style={s.mini}>{f.image ? 'Ketuk foto untuk ganti.' : 'Tambah foto biar gampang dicari di toko.'}</Text>
              {f.image ? <TinyButton label="Hapus foto" danger onPress={() => showDialog('Hapus foto barang?', 'Fotonya dilepas dari barang ini. Barangnya tetap ada di daftar.', [{text: 'Batal', style: 'cancel'}, {text: 'Hapus foto', style: 'destructive', onPress: () => editShopForm({image: undefined})}], {icon: 'image'})} /> : null}
            </View>
          </View>
          <Field label="NAMA BARANG" value={f.name} onChange={name => editShopForm({name})} placeholder="Misal: Beras 5 kg" />
          <View style={[s.row, {gap: 10, alignItems: 'flex-start'}]}><View style={{flex: 1}}><Field label="JUMLAH" value={f.qty} onChange={qty => editShopForm({qty})} placeholder="1" decimal /></View><View style={{flex: 2}}><Field label="HARGA SATUAN (RP)" value={f.price} onChange={price => editShopForm({price})} numeric /></View></View>
          <View style={[s.between, {marginTop: 16}]}><Text style={s.listTitle}>Subtotal</Text><RollingValue align="right" bg={c.pale} value={currency(shopLine(f))} style={s.amount} /></View>
          {formError && <Text style={s.error}>{formError}</Text>}
          <View style={{gap: 6, marginTop: 23}}>
            <Button title="Simpan" icon="check" onPress={() => saveShopForm('list')} />
            {exists ? <AnimatedPressable accessibilityRole="button" accessibilityLabel="Hapus barang ini" onPress={deleteShopItem} style={[s.row, {gap: 7, alignSelf: 'center', padding: 12}]}><Icon name="trash-2" size={15} color={c.red} /><Text style={[s.actionLabel, {color: c.red}]}>Hapus barang</Text></AnimatedPressable>
              : <AnimatedPressable accessibilityRole="button" onPress={() => leaveShopForm('list')} style={{alignSelf: 'center', padding: 12}}><Text style={s.actionLabel}>Batal</Text></AnimatedPressable>}
          </View>
        </>;
      })()}
      {sheet === 'shopping' && shopMode === 'buy' && (() => {
        const active = state.needs.find(n => isShoppingNeed(n) && !n.paid);
        const planned = active ? remainingAmount(active) : shoppingTotal(state.shopping);
        const inCart = shopDraft.filter(d => !d.skip && d.bought).reduce((sum, d) => sum + shopLine(d), 0);
        return <>
          <Text style={s.muted}>Centang barang yang sudah masuk keranjang. Ubah harga atau jumlah kalau beda dari rencana, harga baru dipakai untuk bulan depan.</Text>
          {shopDraft.filter(d => !d.skip).map(item => <View key={item.id} style={[s.section, {marginTop: 12, gap: 0, padding: 14}]}>
            <AnimatedPressable accessibilityRole="checkbox" accessibilityLabel={item.name} accessibilityState={{checked: item.bought}} onPress={() => editShop(item.id, {bought: !item.bought})} style={[s.row, {gap: 10}]}><PopIn trigger={item.bought}><Icon name={item.bought ? 'check-square' : 'square'} size={20} /></PopIn>{item.image && <Image source={{uri: item.image}} style={{width: 40, height: 40, borderRadius: 10}} />}<Marquee containerStyle={{flex: 1}} style={[s.listTitle, item.bought && {textDecorationLine: 'line-through', color: c.muted}]}>{item.name}</Marquee><Text style={[s.amount, !item.bought && {color: c.muted}]}>{currency(shopLine(item))}</Text></AnimatedPressable>
            <View style={[s.row, {gap: 10, alignItems: 'flex-start'}]}><View style={{flex: 1}}><Field label="JUMLAH" value={item.qty} onChange={qty => editShop(item.id, {qty})} placeholder="1" decimal /></View><View style={{flex: 2}}><Field label="HARGA SATUAN (RP)" value={item.price} onChange={price => editShop(item.id, {price})} numeric /></View></View>
          </View>)}
          {!shopDraft.some(d => !d.skip) && <Empty text="Belum ada barang yang perlu dibeli. Tambah barang di daftar dulu." />}
          <View style={[s.section, {marginTop: 12, gap: 7}]}>
            {line('Rencana', currency(planned))}
            {line('Sudah di keranjang', currency(inCart), true)}
            <CrossBlur k={inCart <= planned ? 'under' : 'over'} mode="left"><Text style={[s.mini, inCart > planned && {color: c.red}]}>{inCart <= planned ? `Masih di bawah rencana ${currency(planned - inCart)}` : `Lebih ${currency(inCart - planned)} dari rencana`}</Text></CrossBlur>
          </View>
          {formError && <Text style={s.error}>{formError}</Text>}
          <View style={{gap: 10, marginTop: 23}}><Button title="Selesai belanja" icon="check" disabled={!shopDraft.some(d => d.bought && !d.skip)} onPress={e => finishShopping(e)} /><Button title="Kembali ke daftar" secondary icon="edit-2" onPress={() => {setFormError(''); setShopMode('edit');}} /></View>
        </>;
      })()}
      {sheet === 'token' && <View style={{gap: 12}}>
        <View style={[s.section, {gap: 8}]}>
          {electricity.costPerDay === undefined ? <Text style={s.muted}>Catat minimal 2 kali beli token (atau cek meteran 2 kali) supaya perkiraan muncul.</Text> : <>
            {electricity.typicalAmount > 0 && electricity.daysPerPurchase ? <Text style={s.heading}>{currency(electricity.typicalAmount)} tahan ± {Math.round(electricity.daysPerPurchase)} hari</Text> : null}
            {line('± per hari', currency(electricity.costPerDay))}
            {electricity.monthlyCost !== undefined && line('± per bulan', currency(electricity.monthlyCost))}
            {electricity.kwhPerDay !== undefined && line('± kWh per hari', `${kwhText(electricity.kwhPerDay)} kWh`)}
            {electricity.remainingKwh !== undefined && line('Sisa kWh (perkiraan)', `${kwhText(electricity.remainingKwh)} kWh`)}
            {electricity.nextPurchaseDate && line('Perkiraan habis', shortDate(electricity.nextPurchaseDate))}
          </>}
          {electricity.target && electricity.costPerDay !== undefined && <Text style={[s.body, {lineHeight: 18}, electricity.target.overBudget > 0 && {color: c.red}]}>{electricity.target.overBudget > 0 ? `Lebih ${currency(electricity.target.overBudget)} dari jatah. Supaya pas: ${electricity.target.kwhPerDay !== undefined ? `maksimal ± ${kwhText(electricity.target.kwhPerDay)} kWh/hari${electricity.kwhPerDay !== undefined ? ` (sekarang ± ${kwhText(electricity.kwhPerDay)})` : ''}${electricity.target.saveKwhPerDay ? ` → hemat ± ${kwhText(electricity.target.saveKwhPerDay)} kWh/hari` : ''}` : `maksimal ± ${currency(electricity.target.costPerDay)}/hari`}` : '✓ Masih dalam jatah'}</Text>}
        </View>
        <View style={s.section}>
          <SectionHead title="Beli token" />
          <Field label="NOMINAL (RP)" value={tokenAmount} onChange={setTokenAmount} placeholder="100.000" numeric />
          <Field label="KWH DARI STRUK (OPSIONAL)" value={tokenKwh} onChange={setTokenKwh} placeholder="Misal: 67,8" decimal />
          <Text style={s.muted}>Dicatat hari ini sebagai pengeluaran Token listrik.</Text>
          <Button title="Catat beli token" icon="zap" onPress={buyToken} />
        </View>
        <View style={s.section}>
          <SectionHead title="Cek meteran" />
          <Field label="SISA KWH DI METERAN" value={meterKwh} onChange={setMeterKwh} placeholder="Misal: 42,5" decimal />
          <Button title="Simpan meteran hari ini" secondary icon="activity" onPress={saveMeter} />
        </View>
        <View style={s.section}>
          <SectionHead title="Pengaturan" />
          <Field label="JATAH LISTRIK PER BULAN (RP)" value={elecBudget} onChange={setElecBudget} placeholder="Opsional" numeric />
          <Text style={s.fieldLabel}>DAYA LISTRIK</Text>
          <SegmentPills wrap stagger style={{gap: 6}} options={Object.keys(TOKEN_TARIFF).map(Number).map(va => ({key: va, label: `${va} VA`}))} value={elecPower} onChange={va => setElecPower(elecPower === va ? undefined : va)} />
          <Text style={s.muted}>Daya cuma dipakai kalau struk nggak mencantumkan kWh.</Text>
          <Button title="Simpan pengaturan listrik" secondary icon="sliders" onPress={saveElectricitySettings} />
        </View>
        <View style={s.section}>
          <SectionHead title="Riwayat beli token" />
          {state.electricity?.purchases.length ? [...state.electricity.purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map(p => <Appear key={p.id} style={s.between}><View style={{gap: 3}}><Text style={s.listTitle}>{shortDate(p.date)}</Text>{p.kwh ? <Text style={s.mini}>{kwhText(p.kwh)} kWh</Text> : null}</View><Text style={s.amount}>{currency(p.amount)}</Text></Appear>) : <Text style={s.muted}>Belum ada pembelian token.</Text>}
        </View>
      </View>}
      {sheet === 'gas' && <View style={{gap: 12}}>
        <View style={[s.section, {gap: 8}]}>
          {!gas.purchases ? <Text style={s.muted}>Catat tiap beli gas, DanaSiap hitung 1 tabung tahan berapa lama dan kapan harus beli lagi.</Text> : <>
            {gas.daysPerCylinder !== undefined && <Text style={s.heading}>1 tabung{gas.size !== undefined ? ` ${gasSizeText(gas.size)}` : ''} tahan ± {gasDaysText(gas.daysPerCylinder)}</Text>}
            {gas.guessed && <Text style={s.muted}>(perkiraan awal dari ukuran tabung — makin akurat setelah beli lagi)</Text>}
            {gas.costPerDay !== undefined && line('Biaya gas', `± ${currency(gas.costPerDay)}/hari`)}
            {gas.monthlyCost !== undefined && line('Perkiraan sebulan', `± ${currency(gas.monthlyCost)}`)}
            {gas.nextPurchaseDate && line('Perkiraan habis', `${shortDate(gas.nextPurchaseDate)} · ${gas.daysLeft ? `${gas.daysLeft} hari lagi` : 'hari ini'}`)}
          </>}
          {gas.target && gas.monthlyCost !== undefined && <Text style={[s.body, {lineHeight: 18}, gas.target.overBudget > 0 && {color: c.red}]}>{gas.target.overBudget > 0 ? `Lebih ${currency(gas.target.overBudget)} dari jatah gas per bulan` : '✓ Masih dalam jatah'}</Text>}
        </View>
        <View style={s.section}>
          <SectionHead title="Beli gas" />
          <Text style={s.fieldLabel}>UKURAN TABUNG</Text>
          <SegmentPills style={{gap: 6}} options={GAS_SIZES.map(size => ({key: size as number, label: gasSizeText(size)}))} value={gasSize} onChange={setGasSize} />
          <Field label="HARGA (RP)" value={gasAmount} onChange={setGasAmount} placeholder="22.000" numeric />
          <Field label="JUMLAH TABUNG" value={gasCount} onChange={text => setGasCount(text.replace(/\D/g, '').slice(0, 2))} placeholder="1" numeric />
          <Text style={s.muted}>Dicatat hari ini sebagai pengeluaran Gas elpiji.</Text>
          <Button title="Catat beli gas" icon="thermometer" onPress={buyGas} />
        </View>
        <View style={s.section}>
          <SectionHead title="Pengaturan" />
          <Field label="JATAH GAS PER BULAN (RP)" value={gasBudget} onChange={setGasBudget} placeholder="Opsional" numeric />
          <Button title="Simpan pengaturan gas" secondary icon="sliders" onPress={saveGasSettings} />
        </View>
        <View style={s.section}>
          <SectionHead title="Riwayat beli gas" />
          {state.gas?.purchases.length ? [...state.gas.purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map(p => <Appear key={p.id} style={s.between}><View style={{gap: 3}}><Text style={s.listTitle}>{shortDate(p.date)}</Text><Text style={s.mini}>{p.count ?? 1} × {p.size !== undefined ? gasSizeText(p.size) : 'tabung'}</Text></View><Text style={s.amount}>{currency(p.amount)}</Text></Appear>) : <Text style={s.muted}>Belum ada pembelian gas.</Text>}
        </View>
      </View>}
      {sheet === 'skip' && <>
        <Text style={s.muted}>Misal anak libur sekolah. Semua hari terjadwal di rentang ini ditandai nggak dipakai, uangnya masuk Uang Sisa di tiap harinya.</Text>
        <Text style={[s.fieldLabel, {marginTop: 16, marginBottom: 8}]}>PENGELUARAN</Text>
        <SegmentPills wrap style={{gap: 6}} options={(state.dailyItems ?? []).map(item => ({key: item.id, label: item.title}))} value={skipItem} onChange={setSkipItem} />
        <Field label="DARI (YYYY-MM-DD)" value={skipFrom} onChange={setSkipFrom} />
        <Field label="SAMPAI (YYYY-MM-DD)" value={skipTo} onChange={setSkipTo} />
        <SegmentPills wrap style={{marginTop: 11}} options={[{key: 6, label: '1 minggu'}, {key: 13, label: '2 minggu'}, {key: 29, label: '1 bulan'}]} value={[6, 13, 29].find(days => {try {return skipTo === addDays(skipFrom.trim(), days);} catch {return false;}})} onChange={days => {try {setSkipTo(addDays(skipFrom.trim(), days));} catch {setFormError('Gunakan tanggal YYYY-MM-DD.');}}} />
        {formError && <Text style={s.error}>{formError}</Text>}
        <View style={{marginTop: 23}}><Button title="Tandai libur" onPress={e => saveSkip(e)} icon="sun" /></View>
      </>}
      {sheet === 'attendance' && <>
        <Text style={s.muted}>{shortDate(selectedDay)} · hari kerja otomatis tercatat masuk. Pilih status lain kalau nggak masuk, dan pemasukannya ikut dikoreksi.</Text>
        <StaggerList style={{gap: 10, marginTop: 16}}>
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
              style={[s.between, {padding: 15, backgroundColor: c.white, borderRadius: 14}]}
            >
              <FadeBg on={attStatus === option.key} color={c.lime} radius={14} />
              <Text style={s.body}>{option.label}</Text>
              <PopIn trigger={attStatus === option.key}><Icon name={attStatus === option.key ? 'check-circle' : 'circle'} size={18} /></PopIn>
            </AnimatedPressable>
          ))}
        </StaggerList>
        <Collapse visible={Boolean((attStatus === 'present' || attStatus === 'half'))}>{(
          <Field
            label={attStatus === 'half' ? "UPAH YANG DITERIMA HARI INI (RP)" : "PEMASUKAN AKTUAL (RP) — BOLEH TERMASUK LEMBUR"}
            value={attIncome}
            onChange={val => {
              setAttIncome(val);
              setAttDeductionPct(-1);
            }}
            numeric
          />
        )}</Collapse>
        <Collapse visible={Boolean(attStatus === 'half')}>{(
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
        )}</Collapse>
        <Collapse visible={Boolean(attStatus === 'half' && Boolean(state.profile.activityAllowance))}>{(
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
        )}</Collapse>
        {selectedDay > today && (
          <Text style={[s.muted, {marginTop: 12}]}>Tanggal mendatang adalah rencana kehadiran. Pemasukan belum dianggap sebagai uang yang sudah diterima.</Text>
        )}
        <Collapse visible={Boolean((attStatus === 'absent' || attStatus === 'holiday'))}>{(
          <View style={{marginTop: 16}}>
            <Notice
              title="Dampak pada rencana"
              text={`${selectedWorkday ? `Prediksi kekurangan: ${currency(absence.shortfall)}. ` : 'Hari ini sudah diprediksi tanpa pemasukan. '}Kebutuhan rutin dan pengeluaran tetap dihitung.`}
            />
          </View>
        )}</Collapse>
        {formError && <Text style={s.error}>{formError}</Text>}
        <View style={{marginTop: 23}}>
          <Button title="Simpan kehadiran" onPress={recordAttendance} icon="check" />
        </View>
      </>}
      {sheet === 'settings' && <StaggerList style={{gap: 14}}>
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
        <Button title={working ? 'Profil, pemasukan & hari kerja' : 'Profil & saldo'} secondary icon="sliders" onPress={() => open('setup')} />
        <Button title={reminders ? 'Matikan pengingat perangkat' : 'Aktifkan pengingat'} secondary icon="bell" disabled={demo} onPress={async () => {if (reminders) {setReminders(false); persist(state, demo, false); notify('Pengingat perangkat dimatikan.');} else {try {const granted = await enableReminders(); if (granted) {setReminders(true); persist(state, demo, true); notify('Pengingat aktif.');} else notify('Izin notifikasi belum aktif. Aktifkan notifikasi DanaSiap di pengaturan Android.', 'error');} catch {notify('Pengingat belum aktif. Coba lagi setelah membuka pengaturan notifikasi Android.', 'error');}}}} />
        <Text style={s.muted}>{demo ? 'Pengingat dinonaktifkan pada data contoh.' : 'Pengingat kebutuhan (token, gas, belanja, tagihan), jatah jajan tiap pagi, cek uang sisa tiap sore, awal bulan, dan peringatan kalau uang untuk tagihan & kebutuhan kurang. Buka aplikasi berkala agar jadwal diperbarui.'}</Text>
        <Button title="Akun & sinkron web" secondary icon="cloud" onPress={() => open('cloud')} />
        <Button title="Salin cadangan ke clipboard" secondary icon="copy" onPress={copyBackupToClipboard} />
        <Button title="Bagikan cadangan JSON" secondary icon="share-2" onPress={shareBackupJson} />
        <Button title="Pulihkan cadangan" secondary icon="upload" onPress={() => {setBackupText(''); setBackupPreview(null); open('backup');}} />
        {demo && <Button title="Mulai dengan data pribadi" icon="arrow-up-right" onPress={() => showDialog('Mulai data pribadi?', 'Data contoh akan diganti dengan rencana kosong.', [{text: 'Batal', style: 'cancel'}, {text: 'Mulai', onPress: () => {const fresh = defaultState(today); setDemo(false); persist(fresh, false, false); setProfile({name: '', dailyIncome: '', periodStartDay: '1', openingBalance: '', workDays: [1, 2, 3, 4, 5, 6], activityAllowance: '', payrollCycle: 'daily', payday: '5', avatarUrl: undefined, working: true}); setDailyDraft([]); setSheet('setup'); setTab('home'); notify('Data contoh dihapus. Isi profilmu untuk mulai.');}}])} />}
        <Text style={[s.muted, {textAlign: 'center', marginTop: 10}]}>DanaSiap 1.0 · Rupiah · Asia/Jakarta{`\n`}Angka prediksi mengikuti data yang kamu masukkan.</Text>
      </StaggerList>}
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
                notify('Cadangan ditempel dan valid. Cek ringkasannya sebelum dipulihkan.');
              } catch {
                setBackupPreview(null);
                setFormError('Format cadangan JSON tidak valid.');
                notify('Isi clipboard bukan cadangan DanaSiap yang valid.', 'error');
              }
            } catch {
              setFormError('Gagal membaca clipboard perangkat.');
              notify('Gagal membaca clipboard perangkat.', 'error');
            }
          }}
        />
        {backupPreview && (
          <Appear style={[s.notice, {backgroundColor: '#EAF7D7', borderColor: c.lime, borderWidth: 1}]}>
            <Icon name="check-circle" color={c.ink} size={20} />
            <View style={{flex: 1}}>
              <Text style={s.noticeTitle}>Cadangan valid terverifikasi</Text>
              <Text style={s.muted}>Profil: {backupPreview.name} · {backupPreview.txCount} transaksi · {backupPreview.needsCount} rencana kebutuhan</Text>
            </View>
          </Appear>
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
                showDialog(
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
                        notify(`Cadangan dipulihkan · ${next.transactions.length} transaksi, ${next.needs.length} kebutuhan.`);
                      },
                    },
                  ]
                );
              } catch {
                setFormError('Cadangan tidak valid. Gunakan berkas JSON dari DanaSiap.');
                notify('Cadangan tidak valid. Gunakan berkas JSON dari DanaSiap.', 'error');
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
            <Button title="Keluar dari akun" disabled={busy} secondary icon="log-out" onPress={() => showDialog('Keluar dari akun?', 'Data di perangkat ini tetap ada. Sinkron ke web berhenti sampai kamu masuk lagi.', [{text: 'Batal', style: 'cancel'}, {text: 'Keluar', style: 'destructive', onPress: () => runCloud(async () => { await cloud!.signOut(); setCloudUser(''); notify('Kamu sudah keluar dari akun. Data di perangkat tetap aman.'); })}], {icon: 'log-out'})} />
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
              <Button title="Masuk" disabled={busy} icon="log-in" onPress={() => runCloud(async () => { const session = await cloud!.signIn(cloudEmail.trim(), cloudPassword); setCloudUser(session.user.email ?? cloudEmail); setCloudPassword(''); notify(`Berhasil masuk sebagai ${session.user.email ?? cloudEmail.trim()}.`); })} />
              <Button title="Buat akun baru" disabled={busy} secondary icon="user-plus" onPress={() => runCloud(async () => { const result = await cloud!.signUp(cloudEmail.trim(), cloudPassword); setCloudMessage(result.confirmationRequired ? 'Cek email untuk konfirmasi, lalu masuk kembali.' : 'Akun siap digunakan.'); if (result.session) setCloudUser(result.session.user.email ?? cloudEmail); setCloudPassword(''); notify(result.confirmationRequired ? 'Akun dibuat. Cek email untuk konfirmasi.' : 'Akun dibuat dan siap dipakai.'); })} />
            </View>
          </View>
        )}
        {busy && <ActivityIndicator color={c.ink} style={{marginTop: 15}} />}
        {cloudMessage && <Text style={[s.muted, {marginTop: 15, textAlign: 'center'}]}>{cloudMessage}</Text>}
      </>}
    </CrossBlur></ScrollView></SheetModal>
    <SheetModal visible={editingNeed !== null} onRequestClose={() => { if (keyboardHeight > 0) Keyboard.dismiss(); else setEditingNeed(null); }} onBackdropPress={() => { if (keyboardHeight > 0) Keyboard.dismiss(); else setEditingNeed(null); }} backdropStyle={keyboardHeight > 0 && {paddingBottom: keyboardHeight}} panelStyle={[s.modal, {paddingBottom: keyboardHeight > 0 ? 16 : Math.max(insets.bottom, 22), maxHeight: keyboardHeight > 0 ? Math.max(280, windowHeight - keyboardHeight - (insets.top || 24) - 16) : '91%'}]} overlay={<Toast toast={toastHost === 'need' ? toast : null} bottom={modalToastBottom} onClose={closeToast} />}><View style={[s.between, {gap: 12}]}><Marquee containerStyle={{flex: 1}} style={s.title}>{editingNeed?.title ?? ''}</Marquee><AnimatedPressable accessibilityLabel="Tutup detail kebutuhan" onPress={() => setEditingNeed(null)} style={s.circle}><Icon name="x" /></AnimatedPressable></View>{editingNeed && <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom: 28}}><Text style={[s.number, {marginTop: 12}]}>{currency(remainingAmount(editingNeed))}</Text><Text style={s.muted}>Jadwal {shortDate(editingNeed.dueDate)} · alokasi {currency(editingNeed.saved)}</Text><Field label="ALOKASI DARI SALDO (RP)" value={allocatedInput} onChange={setAllocatedInput} numeric /><Field label="JADWAL BARU (YYYY-MM-DD)" value={rescheduleDate} onChange={setRescheduleDate} /><View style={[s.row, {gap: 9, marginTop: 11}]}><Chip label="−1 hari" active={false} onPress={() => {try {setRescheduleDate(addDays(rescheduleDate, -1));} catch {setFormError('Gunakan tanggal YYYY-MM-DD.');}}} /><Chip label="+1 hari" active={false} onPress={() => {try {setRescheduleDate(addDays(rescheduleDate, 1));} catch {setFormError('Gunakan tanggal YYYY-MM-DD.');}}} /><Chip label="+3 hari" active={false} onPress={() => {try {setRescheduleDate(addDays(rescheduleDate, 3));} catch {setFormError('Gunakan tanggal YYYY-MM-DD.');}}} /></View>{formError && <Text style={s.error}>{formError}</Text>}<View style={{gap: 11, marginTop: 22}}><Button title="Simpan & hitung ulang" secondary icon="calendar" onPress={() => {try {const next = reducer(reducer(current.current, {type: 'need/reschedule', id: editingNeed.id, dueDate: rescheduleDate}), {type: 'need/update', id: editingNeed.id, changes: {saved: number(allocatedInput)}}); persist(next); setEditingNeed(null); notify(`Rencana ${editingNeed.title} diperbarui · ${shortDate(rescheduleDate)}, alokasi ${currency(number(allocatedInput))}.`);} catch (error) {setFormError(error instanceof Error ? error.message : 'Periksa alokasi dan tanggal.');}}} /><Button title={isShoppingNeed(editingNeed) ? 'Mulai belanja' : isElectricityNeed(editingNeed) ? 'Catat beli token' : isGasNeed(editingNeed) ? 'Catat beli gas' : editingNeed.kind === 'recurring' ? 'Sudah dipakai / dibayar hari ini' : 'Sudah dibayar hari ini'} icon="check-circle" onPress={() => payNeed(editingNeed)} /></View><Text style={[s.muted, {marginTop: 12}]}>Jika rutin, jadwal berikutnya dimulai dari pembayaran aktual. Saldo dan prediksi langsung diperbarui.</Text></ScrollView>}</SheetModal>
  </View>;
}
