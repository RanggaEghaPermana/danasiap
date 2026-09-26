/**
 * DanaSiap motion system — one motion language for every feedback, action and movement.
 *
 * Tokens come from the frame-by-frame reference spec:
 * - spring (general): stiffness 380, damping 30, mass 1 (~450 ms, ~4% overshoot)
 * - pop spring (icons): stiffness 500, damping 22 (~10% overshoot)
 * - exit easing: cubic-bezier(0.4, 0, 1, 1); exits are faster than entrances
 * - blur: out 0 → 6 px, in 8 px → 0; content scale 0.94 ↔ 1; slide 6 px
 * - reduced motion: no blur, no movement, opacity-only 150 ms
 *
 * Everything transform/opacity based runs on the native driver. Layout-affecting values
 * (widths, positions of indicators) run on separate JS-driven values, never mixed on one view.
 *
 * Blur is emulated with expo-blur: content lives inside a BlurTargetView and a BlurView overlay
 * (a blurred copy of that content) is mounted only while a transition runs, its opacity animated
 * together with the content's opacity/scale.
 */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing, GestureResponderEvent, LayoutAnimation, LayoutChangeEvent, Modal, Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import type { BlurTint } from 'expo-blur';
import { colors as c, styles as s } from './theme';

// ─── Tokens ────────────────────────────────────────────────────────────────
export const SPRING = {stiffness: 380, damping: 30, mass: 1};
export const POP = {stiffness: 500, damping: 22, mass: 1};
export const EXIT_EASING = Easing.bezier(0.4, 0, 1, 1);
const PRESS_EASING = Easing.out(Easing.quad);
export const T = {exit: 160, close: 130, press: 80, reduced: 150, fade: 200, stagger: 35, enterDelay: 80, veilIn: 100, flyDelayAfterSheet: 170};
export const BLUR = {out: 6, in: 8, reduction: 4};
export const SCALE = {content: 0.94, surface: 0.96, press: 0.95, pop: 0.6};
/** Real blur only where it is GPU-backed (Android 12+ RenderEffect, iOS). Elsewhere: opacity + scale only. */
export const BLUR_SUPPORTED = Platform.OS === 'ios' || (Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 31);

// ─── Reduced motion (pattern 10) ───────────────────────────────────────────
let reduced = false;
const reducedListeners = new Set<() => void>();
function setReduced(value: boolean) {
  if (value === reduced) return;
  reduced = value;
  reducedListeners.forEach(listener => listener());
}
AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
const subscribeReduced = (listener: () => void) => {reducedListeners.add(listener); return () => {reducedListeners.delete(listener);};};
export const isReducedMotion = () => reduced;
export function useReducedMotion() { return useSyncExternalStore(subscribeReduced, isReducedMotion, isReducedMotion); }

// ─── Animation helpers ─────────────────────────────────────────────────────
type SpringOpts = {delay?: number; pop?: boolean; native?: boolean};
export function spring(value: Animated.Value, toValue: number, {delay = 0, pop = false, native = true}: SpringOpts = {}) {
  return Animated.spring(value, {toValue, ...(pop ? POP : SPRING), delay, useNativeDriver: native, restDisplacementThreshold: 0.001, restSpeedThreshold: 0.001});
}
export function exit(value: Animated.Value, toValue: number, duration: number = T.exit, delay = 0, native = true) {
  return Animated.timing(value, {toValue, duration, delay, easing: EXIT_EASING, useNativeDriver: native});
}
/** Reduced-motion replacement: opacity only, 150 ms. */
export function fade(value: Animated.Value, toValue: number, delay = 0, native = true) {
  return Animated.timing(value, {toValue, duration: T.reduced, delay, easing: Easing.linear, useNativeDriver: native});
}
/** Smoothly morphs container sizes on the next layout pass (siblings slide, never jump). */
export function layoutSpring() {
  if (reduced) return;
  // Damping ratio of the spec spring: 30 / (2 * sqrt(380 * 1)) ≈ 0.77.
  LayoutAnimation.configureNext({duration: 450, update: {type: LayoutAnimation.Types.spring, springDamping: 0.77}});
}

export type Rect = {x: number; y: number; width: number; height: number};
export function measure(view: View | null | undefined): Promise<Rect | null> {
  return new Promise(resolve => {
    if (!view) return resolve(null);
    try {view.measureInWindow((x, y, width, height) => resolve(width || height ? {x, y, width, height} : null));} catch {resolve(null);}
  });
}
export function pointOf(event?: GestureResponderEvent | null) {
  const n = event?.nativeEvent;
  return n && Number.isFinite(n.pageX) && Number.isFinite(n.pageY) ? {x: n.pageX, y: n.pageY} : null;
}

// ─── Blur veil ─────────────────────────────────────────────────────────────
export type Veil = {
  value: Animated.Value;
  active: boolean;
  /** Old content blurs out, new content sharpens in (0 → 1 → 0). */
  pulse: () => void;
  /** Appearing content: starts blurred (8 px), sharpens with the spring. */
  enter: (delay?: number) => void;
  /** Disappearing content: blurs out (→ 6 px) with the fast exit curve and stays blurred. */
  leave: () => void;
};
export function useVeil(): Veil {
  const value = useRef(new Animated.Value(0)).current;
  const [active, setActive] = useState(false);
  const token = useRef(0);
  const start = useCallback((anim: Animated.CompositeAnimation, keep = false) => {
    if (!BLUR_SUPPORTED || reduced) return;
    const id = ++token.current;
    setActive(true);
    anim.start(({finished}) => {if (finished && !keep && id === token.current) setActive(false);});
  }, [value]);
  const pulse = useCallback(() => {
    value.stopAnimation(); value.setValue(0);
    start(Animated.sequence([Animated.timing(value, {toValue: 1, duration: T.veilIn, easing: Easing.out(Easing.quad), useNativeDriver: true}), spring(value, 0)]));
  }, [start, value]);
  const enter = useCallback((delay = 0) => {value.stopAnimation(); value.setValue(1); start(spring(value, 0, {delay}));}, [start, value]);
  const leave = useCallback(() => {value.stopAnimation(); start(exit(value, BLUR.out / BLUR.in, T.close), true);}, [start, value]);
  return useMemo(() => ({value, active, pulse, enter, leave}), [value, active, pulse, enter, leave]);
}
const VeilContext = createContext<Veil | null>(null);
/** The nearest blurred surface (screen, sheet) so nested content swaps can blur it. */
export const useParentVeil = () => useContext(VeilContext);

/**
 * Wraps content in a blur target and, while `veil.active`, overlays a blurred copy of it.
 * `bg` must be the opaque surface colour behind the content so the blurred copy never shows the window.
 */
export function Veiled({veil, bg, radius = 0, tint = 'default', style, targetStyle, children, provide = false}: {veil: Veil; bg: string; radius?: number; tint?: BlurTint; style?: StyleProp<ViewStyle>; targetStyle?: StyleProp<ViewStyle>; children: React.ReactNode; provide?: boolean}) {
  const target = useRef<View>(null);
  const body = BLUR_SUPPORTED
    ? <BlurTargetView ref={target} style={[{backgroundColor: bg, borderRadius: radius}, targetStyle]}>{children}</BlurTargetView>
    : <View style={[{backgroundColor: bg, borderRadius: radius}, targetStyle]}>{children}</View>;
  const content = <View style={style}>
    {body}
    {veil.active && BLUR_SUPPORTED ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {opacity: veil.value, borderRadius: radius, overflow: 'hidden'}]}>
      <BlurView blurTarget={target} blurMethod="dimezisBlurView" intensity={BLUR.in * BLUR.reduction} blurReductionFactor={BLUR.reduction} tint={tint} style={StyleSheet.absoluteFill} />
    </Animated.View> : null}
  </View>;
  return provide ? <VeilContext.Provider value={veil}>{content}</VeilContext.Provider> : content;
}

/** Low-level pieces for surfaces whose blur overlay must follow an animated shape (e.g. the morphing nav pill). */
export const BlurTarget: React.ComponentType<{ref?: React.Ref<View>; style?: StyleProp<ViewStyle>; children?: React.ReactNode; pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto'}> = (BLUR_SUPPORTED ? BlurTargetView : View) as any;
export function BlurLayer({veil, target, tint = 'default'}: {veil: Veil; target: React.RefObject<View | null>; tint?: BlurTint}) {
  if (!veil.active || !BLUR_SUPPORTED) return null;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {opacity: veil.value}]}>
    <BlurView blurTarget={target} blurMethod="dimezisBlurView" intensity={BLUR.in * BLUR.reduction} blurReductionFactor={BLUR.reduction} tint={tint} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}

// ─── Pattern 5: press feedback ─────────────────────────────────────────────
const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);
export type PressProps = {
  onPress?: (event: GestureResponderEvent) => void;
  children: React.ReactNode;
  style?: any;
  disabled?: boolean;
  accessibilityRole?: any;
  accessibilityLabel?: string;
  accessibilityState?: any;
  hitSlop?: any;
  viewRef?: React.Ref<View>;
  onLayout?: (event: LayoutChangeEvent) => void;
};
/** Every pressable: scale 0.95 on press-in (80 ms ease-out), spring back to 1 on release. */
export function PressScale({onPress, children, style, disabled, accessibilityRole = 'button', accessibilityLabel, accessibilityState, hitSlop, viewRef, onLayout}: PressProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const dim = useRef(new Animated.Value(1)).current;
  const reducedNow = useReducedMotion();
  const pressIn = () => {
    if (reducedNow) fade(dim, 0.7).start();
    else Animated.timing(scale, {toValue: SCALE.press, duration: T.press, easing: PRESS_EASING, useNativeDriver: true}).start();
  };
  const pressOut = () => {
    if (reducedNow) fade(dim, 1).start();
    else spring(scale, 1).start();
  };
  return (
    <AnimatedPressableBase
      ref={viewRef as any}
      onPress={onPress && (event => {
        // Whatever this tap changes in the layout, neighbours slide into place instead of jumping.
        layoutSpring();
        onPress(event);
      })}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onLayout={onLayout}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      hitSlop={hitSlop}
      style={[{opacity: dim, transform: [{scale}]}, style]}
    >
      {children}
    </AnimatedPressableBase>
  );
}

/** True inside the outgoing snapshot of a CrossBlur: nested entrance animations render settled instead of replaying. */
const FrozenContext = createContext(false);
const useFrozen = () => useContext(FrozenContext);

// ─── Pattern 1 / 7: morph & value change ───────────────────────────────────
type SwapMode = 'block' | 'left' | 'right';
/**
 * When `k` changes the old content cross-blurs out (opacity → 0, scale → 0.94, 160 ms exit curve)
 * while the new content comes in 80 ms later (opacity, scale 0.94 → 1, 6 px slide, spring).
 * `variant="value"` is pattern 7: old value leaves 4 px upward, new value rises 4 px from below, no scale.
 */
export function CrossBlur({k, children, style, mode = 'block', variant = 'morph', parentVeil = false, onSwap}: {k: string | number; children: React.ReactNode; style?: StyleProp<ViewStyle>; mode?: SwapMode; variant?: 'morph' | 'value'; parentVeil?: boolean; onSwap?: () => void}) {
  const reducedNow = useReducedMotion();
  const veil = useParentVeil();
  const enter = useRef(new Animated.Value(1)).current;
  const leave = useRef(new Animated.Value(0)).current;
  // Each key keeps its own layer. When the key changes, the old layer stays the SAME mounted
  // instance while it animates out (no remount = no blank frame), and only the new one mounts.
  const nodes = useRef(new Map<string | number, React.ReactNode>());
  nodes.current.set(k, children);
  const [prevK, setPrevK] = useState(k);
  const [leavingK, setLeavingK] = useState<string | number | null>(null);
  if (k !== prevK) {
    // Derived state: the layer that was on screen becomes the leaving one.
    setPrevK(k);
    setLeavingK(prevK);
  }
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {first.current = false; return;}
    onSwap?.();
    if (parentVeil) veil?.pulse();
    enter.stopAnimation(); leave.stopAnimation();
    enter.setValue(0); leave.setValue(1);
    const out = reduced ? fade(leave, 0) : exit(leave, 0, T.exit);
    const inn = reduced ? fade(enter, 1) : spring(enter, 1, {delay: variant === 'value' ? 40 : T.enterDelay});
    out.start(({finished}) => {if (finished) setLeavingK(null);});
    inn.start();
  }, [k]);
  const still = reducedNow;
  const value = variant === 'value';
  const inStyle = {opacity: enter, transform: still ? [] : value
    ? [{translateY: enter.interpolate({inputRange: [0, 1], outputRange: [4, 0]})}]
    : [{translateY: enter.interpolate({inputRange: [0, 1], outputRange: [6, 0]})}, {scale: enter.interpolate({inputRange: [0, 1], outputRange: [SCALE.content, 1]})}]};
  const outStyle = {opacity: leave, transform: still ? [] : value
    ? [{translateY: leave.interpolate({inputRange: [0, 1], outputRange: [-4, 0]})}]
    : [{scale: leave.interpolate({inputRange: [0, 1], outputRange: [SCALE.content, 1]})}]};
  const place: ViewStyle = mode === 'block' ? {position: 'absolute', top: 0, left: 0, right: 0} : mode === 'left' ? {position: 'absolute', top: 0, left: 0, width: 640, alignItems: 'flex-start'} : {position: 'absolute', top: 0, right: 0, width: 640, alignItems: 'flex-end'};
  const order = leavingK !== null && leavingK !== k ? [leavingK, k] : [k];
  for (const key of [...nodes.current.keys()]) if (!order.includes(key)) nodes.current.delete(key);
  return <View style={style}>
    {order.map(key => {
      const leaving = key !== k;
      return <Animated.View key={String(key)} pointerEvents={leaving ? 'none' : 'auto'} accessibilityElementsHidden={leaving} importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'} style={leaving ? [place, outStyle] : inStyle}>
        <FrozenContext.Provider value={leaving}>{nodes.current.get(key)}</FrozenContext.Provider>
      </Animated.View>;
    })}
  </View>;
}

/** Pattern 7 for numbers/text. Pass `bg` (surface colour) to add the real blur. */
export function RollingValue({value, style, bg, align = 'left', containerStyle}: {value: string; style?: any; bg?: string; align?: 'left' | 'right'; containerStyle?: StyleProp<ViewStyle>}) {
  const veil = useVeil();
  const text = <CrossBlur k={value} mode={align} variant="value" onSwap={bg ? veil.pulse : undefined}><Text style={style}>{value}</Text></CrossBlur>;
  if (!bg || !BLUR_SUPPORTED) return <View style={containerStyle}>{text}</View>;
  return <Veiled veil={veil} bg={bg} radius={4} style={containerStyle}>{text}</Veiled>;
}

// ─── Pattern 9: appear / disappear ─────────────────────────────────────────
/**
 * Cards, toasts, notices, rows: appear with opacity + scale 0.96 → 1 + slight rise (spring),
 * disappear with pattern 3 (opacity → 0, scale → 0.96, 130 ms exit curve). With `bg`, the real blur runs too.
 */
export function Appear({visible = true, children, style, delay = 0, rise = 6, bg, radius = 0, onExited}: {visible?: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle>; delay?: number; rise?: number; bg?: string; radius?: number; onExited?: () => void}) {
  const reducedNow = useReducedMotion();
  const frozen = useFrozen();
  const p = useRef(new Animated.Value(frozen ? 1 : 0)).current;
  const y = useRef(new Animated.Value(frozen ? 0 : 1)).current;
  const veil = useVeil();
  const [mounted, setMounted] = useState(visible);
  const last = useRef(children);
  if (visible) last.current = children;
  useEffect(() => {
    if (frozen) return;
    if (visible) {
      setMounted(true);
      p.stopAnimation();
      if (reduced) {y.setValue(0); fade(p, 1, delay).start(); return;}
      if (bg) veil.enter(delay);
      spring(p, 1, {delay}).start();
      spring(y, 0, {delay}).start();
    } else if (mounted) {
      if (bg) veil.leave();
      (reduced ? fade(p, 0) : exit(p, 0, T.close)).start(({finished}) => {if (finished) {setMounted(false); y.setValue(1); onExited?.();}});
    }
  }, [visible]);
  if (!mounted && !visible) return null;
  const animated = {opacity: p, transform: reducedNow ? [] : [{translateY: y.interpolate({inputRange: [0, 1], outputRange: [0, rise]})}, {scale: p.interpolate({inputRange: [0, 1], outputRange: [SCALE.surface, 1]})}]};
  const node = visible ? children : last.current;
  return <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[style, animated]}>
    {bg ? <Veiled veil={veil} bg={bg} radius={radius}>{node}</Veiled> : node}
  </Animated.View>;
}

/** Pattern 4: a value that lands pops (scale 0.6 → 1 with the pop spring) whenever `trigger` changes. */
export function PopIn({children, trigger, style}: {children: React.ReactNode; trigger?: unknown; style?: StyleProp<ViewStyle>}) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {first.current = false; return;}
    if (reduced) return;
    v.setValue(SCALE.pop);
    spring(v, 1, {pop: true}).start();
  }, [trigger]);
  return <Animated.View style={[style, {transform: [{scale: v}]}]}>{children}</Animated.View>;
}

// ─── Pattern 2 / 3: menus & choice groups ──────────────────────────────────
/** One menu item: appears in order (35 ms stagger, nearest to the trigger first), sliding 8 px away from the trigger into place. */
export function StaggerItem({order, from, children, style, closing = false}: {order: number; from: 'top' | 'bottom'; children: React.ReactNode; style?: StyleProp<ViewStyle>; closing?: boolean}) {
  const reducedNow = useReducedMotion();
  const frozen = useFrozen();
  const p = useRef(new Animated.Value(frozen ? 1 : 0)).current;
  const y = useRef(new Animated.Value(frozen ? 0 : 1)).current;
  useEffect(() => {
    if (frozen) return;
    if (reduced) {y.setValue(0); fade(p, 1).start(); return;}
    spring(p, 1, {delay: order * T.stagger}).start();
    spring(y, 0, {delay: order * T.stagger}).start();
  }, []);
  useEffect(() => {
    if (!closing) return;
    // Pattern 3: everything closes together, faster than it opened.
    (reduced ? fade(p, 0) : exit(p, 0, T.close)).start();
  }, [closing]);
  const offset = from === 'bottom' ? 8 : -8;
  return <Animated.View style={[style, {opacity: p, transform: reducedNow ? [] : [{translateY: y.interpolate({inputRange: [0, 1], outputRange: [0, offset]})}, {scale: p.interpolate({inputRange: [0, 1], outputRange: [SCALE.surface, 1]})}]}]}>{children}</Animated.View>;
}

/**
 * A group of choices/menu rows. `origin` is where the trigger sits relative to the list:
 * rows nearest the trigger appear first. Closing keeps rows mounted for the 130 ms exit.
 */
export function StaggerList({visible = true, origin = 'top', children, style, bg, radius = 0, itemStyle}: {visible?: boolean; origin?: 'top' | 'bottom'; children: React.ReactNode; style?: StyleProp<ViewStyle>; bg?: string; radius?: number; itemStyle?: StyleProp<ViewStyle>}) {
  const [mounted, setMounted] = useState(visible);
  const [round, setRound] = useState(0);
  const frozen = useFrozen();
  const veil = useVeil();
  const last = useRef(children);
  const wasVisible = useRef(visible);
  if (visible) last.current = children;
  useEffect(() => {
    const reopened = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (visible) {
      setMounted(true);
      if (reopened) setRound(r => r + 1);
      if (bg && !frozen) veil.enter(T.stagger * 2);
    } else if (mounted) {
      if (bg) veil.leave();
      const timer = setTimeout(() => {layoutSpring(); setMounted(false);}, reduced ? T.reduced : T.close);
      return () => clearTimeout(timer);
    }
  }, [visible]);
  if (!mounted && !visible) return null;
  const items = React.Children.toArray(visible ? children : last.current);
  const n = items.length;
  const list = <View style={style}>{items.map((child, i) => <StaggerItem key={`${round}-${(child as any)?.key ?? i}`} order={origin === 'bottom' ? n - 1 - i : i} from={origin} closing={!visible} style={itemStyle}>{child}</StaggerItem>)}</View>;
  return bg ? <Veiled veil={veil} bg={bg} radius={radius}>{list}</Veiled> : list;
}

// ─── Expanding sections push their neighbours smoothly ─────────────────────
/** Neighbours slide back up a little slower than the content blurs out, so nothing snaps. */
const COLLAPSE_CLOSE_MS = 240;
/**
 * Mounts/unmounts its content while its HEIGHT springs open and eases shut, so everything below
 * moves with it. Explicit on purpose: LayoutAnimation is not reliable on Android's new architecture.
 */
export function Collapse({visible, children, style}: {visible: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle>}) {
  const [mounted, setMounted] = useState(visible);
  const [animating, setAnimating] = useState(false);
  const height = useRef(new Animated.Value(0)).current;
  const natural = useRef(0);
  const waiting = useRef(false);
  const last = useRef(children);
  if (visible) last.current = children;
  const first = useRef(true);
  const open = (to: number) => {
    waiting.current = false;
    spring(height, to, {native: false}).start(({finished}) => {if (finished) setAnimating(false);});
  };
  useEffect(() => {
    if (first.current) {first.current = false; return;}
    height.stopAnimation();
    if (visible) {
      if (reduced) {setMounted(true); setAnimating(false); return;}
      setAnimating(true);
      if (mounted && natural.current > 0) open(natural.current); // re-opened while closing
      else {height.setValue(0); waiting.current = true; setMounted(true);}
    } else if (mounted) {
      if (reduced) {setMounted(false); return;}
      height.setValue(natural.current);
      setAnimating(true);
      Animated.timing(height, {toValue: 0, duration: COLLAPSE_CLOSE_MS, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: false})
        .start(({finished}) => {if (finished) {setMounted(false); setAnimating(false);}});
    }
  }, [visible]);
  if (!mounted) return null;
  return <Animated.View style={[style, animating && {height, overflow: 'hidden'}]}>
    <View onLayout={e => {
      natural.current = e.nativeEvent.layout.height;
      if (waiting.current && natural.current > 0) open(natural.current);
    }}>{visible ? children : last.current}</View>
  </Animated.View>;
}

// ─── Pattern 6: sliding tab indicator ──────────────────────────────────────
/** Active background colour cross-fade (200 ms), for toggles that are not part of a single-choice group. */
export function FadeBg({on, color, radius = 0}: {on: boolean; color: string; radius?: number}) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {Animated.timing(v, {toValue: on ? 1 : 0, duration: reduced ? T.reduced : T.fade, useNativeDriver: true}).start();}, [on]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {backgroundColor: color, borderRadius: radius, opacity: v}]} />;
}

type Box = {x: number; y: number; width: number; height: number};
/**
 * Single-choice pill group whose active background SLIDES (x, y, width; spring 450 ms) to the chosen pill.
 * `value` may match nothing — the indicator then fades away.
 */
export function SegmentPills<K extends string | number>({options, value, onChange, wrap = false, style, stagger = false}: {options: readonly {key: K; label: string}[]; value: K | null | undefined; onChange: (key: K) => void; wrap?: boolean; style?: StyleProp<ViewStyle>; stagger?: boolean}) {
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const left = useRef(new Animated.Value(0)).current;
  const top = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const height = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const frozen = useFrozen();
  const target = value === null || value === undefined ? undefined : boxes[String(value)];
  useEffect(() => {
    if (!target) {Animated.timing(shown, {toValue: 0, duration: T.fade, useNativeDriver: false}).start(); placed.current = false; return;}
    if (!placed.current || reduced) {
      left.setValue(target.x); top.setValue(target.y); width.setValue(target.width); height.setValue(target.height);
      placed.current = true;
      if (frozen) shown.setValue(1);
      else Animated.timing(shown, {toValue: 1, duration: reduced ? T.reduced : T.fade, useNativeDriver: false}).start();
      return;
    }
    shown.setValue(1);
    Animated.parallel([spring(left, target.x, {native: false}), spring(top, target.y, {native: false}), spring(width, target.width, {native: false}), spring(height, target.height, {native: false})]).start();
  }, [target?.x, target?.y, target?.width, target?.height]);
  const setBox = (key: K) => (event: LayoutChangeEvent) => {
    const {x, y, width: w, height: h} = event.nativeEvent.layout;
    setBoxes(prev => {const old = prev[String(key)]; return old && old.x === x && old.y === y && old.width === w && old.height === h ? prev : {...prev, [String(key)]: {x, y, width: w, height: h}};});
  };
  return <View style={[{flexDirection: 'row', gap: 7}, wrap && {flexWrap: 'wrap'}, style]}>
    {options.map(o => boxes[String(o.key)] ? <View key={`bg-${o.key}`} pointerEvents="none" style={{position: 'absolute', left: boxes[String(o.key)].x, top: boxes[String(o.key)].y, width: boxes[String(o.key)].width, height: boxes[String(o.key)].height, borderRadius: 22, backgroundColor: c.white}} /> : null)}
    <Animated.View pointerEvents="none" style={{position: 'absolute', left, top, width, height, opacity: shown, borderRadius: 22, backgroundColor: c.lime}} />
    {options.map((o, i) => {
      const active = o.key === value;
      const pill = <PressScale accessibilityLabel={o.label} accessibilityState={{selected: active}} onPress={() => {layoutSpring(); onChange(o.key);}} style={[s.tab, {backgroundColor: 'transparent'}]}>
        <Text style={[s.actionLabel, active && {color: c.ink, fontWeight: 'bold'}]}>{o.label}</Text>
      </PressScale>;
      return <View key={String(o.key)} onLayout={setBox(o.key)}>{stagger ? <StaggerItem order={i} from="top">{pill}</StaggerItem> : pill}</View>;
    })}
  </View>;
}

// ─── Pattern 8: fly to target ──────────────────────────────────────────────
type Flight = {id: number; from: {x: number; y: number}; to: Rect; text: string; delay: number; onLand?: () => void};
const flightListeners = new Set<(flight: Flight) => void>();
/** A chip with the amount detaches from `from`, springs to `to`, shrinks to 0.6 and fades as it lands. */
export function flyChip({from, to, text, delay = 0, onLand}: Omit<Flight, 'id' | 'delay'> & {delay?: number}) {
  if (reduced || !flightListeners.size) {onLand?.(); return;}
  const flight = {id: Date.now() + Math.random(), from, to, text, delay, onLand};
  flightListeners.forEach(listener => listener(flight));
}
export function FlyLayer() {
  const [flights, setFlights] = useState<Flight[]>([]);
  useEffect(() => {
    const listener = (flight: Flight) => setFlights(list => [...list, flight]);
    flightListeners.add(listener);
    return () => {flightListeners.delete(listener);};
  }, []);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {flights.map(f => <FlyingChip key={f.id} flight={f} onDone={() => setFlights(list => list.filter(x => x.id !== f.id))} />)}
  </View>;
}
function FlyingChip({flight, onDone}: {flight: Flight; onDone: () => void}) {
  const x = useRef(new Animated.Value(flight.from.x)).current;
  const y = useRef(new Animated.Value(flight.from.y - 28)).current;
  const scale = useRef(new Animated.Value(SCALE.pop)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [size, setSize] = useState<{w: number; h: number} | null>(null);
  const landed = useRef(false);
  const land = () => {if (landed.current) return; landed.current = true; flight.onLand?.(); onDone();};
  useEffect(() => {
    if (!size) return;
    const d = flight.delay;
    const tx = flight.to.x + flight.to.width / 2, ty = flight.to.y + flight.to.height / 2;
    Animated.timing(opacity, {toValue: 1, duration: 90, delay: d, useNativeDriver: true}).start();
    spring(scale, 1, {pop: true, delay: d}).start();
    spring(x, tx, {delay: d + 60}).start();
    spring(y, ty, {delay: d + 60}).start();
    Animated.parallel([exit(scale, SCALE.pop, T.exit, d + 360), exit(opacity, 0, T.exit, d + 360)]).start(land);
    const safety = setTimeout(land, d + 1400);
    return () => clearTimeout(safety);
  }, [size]);
  return <Animated.View onLayout={e => {if (!size) setSize({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height});}} style={{position: 'absolute', left: 0, top: 0, opacity, transform: [{translateX: Animated.subtract(x, (size?.w ?? 0) / 2)}, {translateY: Animated.subtract(y, (size?.h ?? 0) / 2)}, {scale}]}}>
    <View style={{backgroundColor: c.lime, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: c.ink + '22', shadowColor: '#000', shadowOffset: {width: 0, height: 6}, shadowOpacity: .18, shadowRadius: 10, elevation: 6}}>
      <Text style={{fontFamily: 'BarlowMedium', fontSize: 15, color: c.ink}}>{flight.text}</Text>
    </View>
  </Animated.View>;
}

// ─── Sheets (pattern 9 for dialogs) ────────────────────────────────────────
/**
 * Bottom sheet: backdrop fades, the panel rises from the bottom edge with opacity + scale 0.96 → 1
 * and a blur that sharpens (spring). Closing uses pattern 3 and keeps the last content on screen
 * until the 130 ms exit finishes.
 */
export function SheetModal({visible, onRequestClose, onBackdropPress, backdropStyle, panelStyle, children, overlay}: {visible: boolean; onRequestClose: () => void; onBackdropPress: () => void; backdropStyle?: StyleProp<ViewStyle>; panelStyle?: StyleProp<ViewStyle>; children: React.ReactNode; overlay?: React.ReactNode}) {
  const reducedNow = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const backdrop = useRef(new Animated.Value(0)).current;
  const p = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(1)).current;
  const veil = useVeil();
  const last = useRef(children);
  if (visible) last.current = children;
  useEffect(() => {
    if (visible) {
      setMounted(true);
      backdrop.stopAnimation(); p.stopAnimation();
      if (reduced) {rise.setValue(0); fade(backdrop, 1).start(); fade(p, 1).start(); return;}
      Animated.timing(backdrop, {toValue: 1, duration: T.fade, easing: Easing.out(Easing.quad), useNativeDriver: true}).start();
      veil.enter(40);
      spring(p, 1).start();
      spring(rise, 0).start();
    } else if (mounted) {
      veil.leave();
      Animated.parallel([(reduced ? fade(backdrop, 0) : exit(backdrop, 0, T.close + 40)), (reduced ? fade(p, 0) : exit(p, 0, T.close))]).start(({finished}) => {if (finished) {setMounted(false); rise.setValue(1);}});
    }
  }, [visible]);
  return <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onRequestClose}>
    <View style={[{flex: 1, justifyContent: 'flex-end'}, backdropStyle]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {backgroundColor: '#11170CAC', opacity: backdrop}]} />
      <Pressable accessibilityLabel="Tutup lembar" style={StyleSheet.absoluteFill} onPress={onBackdropPress} />
      <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[panelStyle, {opacity: p, transformOrigin: 'bottom', transform: reducedNow ? [] : [{translateY: rise.interpolate({inputRange: [0, 1], outputRange: [0, 18]})}, {scale: p.interpolate({inputRange: [0, 1], outputRange: [SCALE.surface, 1]})}]}]}>
        <Veiled veil={veil} bg={c.pale} provide style={{flexShrink: 1}} targetStyle={{flexShrink: 1}}>{visible ? children : last.current}</Veiled>
      </Animated.View>
    </View>
    {overlay}
  </Modal>;
}
