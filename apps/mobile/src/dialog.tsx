/**
 * DanaSiap's own confirm/alert dialog, replacing the stock Android Alert so dialogs share the app's
 * look and motion (pattern 9: rise from 0.96 on the spring, close faster in 130 ms).
 * `showDialog` takes the same arguments as `Alert.alert`.
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, BackHandler, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors as c, styles as s } from './theme';
import { PressScale, SCALE, T, exit, fade, isReducedMotion, spring } from './motion';

export type DialogButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
export type DialogOptions = { icon?: React.ComponentProps<typeof Feather>['name']; cancelable?: boolean };
type Dialog = { id: number; title: string; message?: string; buttons: DialogButton[]; options: DialogOptions };

let queue: Dialog[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};};
const current = () => queue[0] ?? null;

export function showDialog(title: string, message?: string, buttons: DialogButton[] = [{text: 'Oke'}], options: DialogOptions = {}) {
  queue = [...queue, {id: nextId++, title, message, buttons: buttons.length ? buttons : [{text: 'Oke'}], options}];
  emit();
}

function Choice({button, primary, full, onPress}: {button: DialogButton; primary: boolean; full: boolean; onPress: () => void}) {
  const destructive = button.style === 'destructive';
  const dark = primary || destructive;
  return <PressScale accessibilityLabel={button.text} onPress={onPress} style={[s.button, full ? {alignSelf: 'stretch'} : {flex: 1}, !dark && s.secondaryButton, destructive && {backgroundColor: c.red}]}>
    <Text style={[s.buttonText, !dark && {color: c.ink}]}>{button.text}</Text>
  </PressScale>;
}

/** Render once near the root of the app. */
export function DialogHost() {
  const dialog = useSyncExternalStore(subscribe, current, current);
  const [shown, setShown] = useState<Dialog | null>(null);
  const backdrop = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    if (!dialog || dialog.id === shown?.id) return;
    closing.current = false;
    setShown(dialog);
    backdrop.setValue(0);
    card.setValue(0);
    const reduced = isReducedMotion();
    Animated.parallel([
      reduced ? fade(backdrop, 1) : Animated.timing(backdrop, {toValue: 1, duration: T.fade, useNativeDriver: true}),
      reduced ? fade(card, 1) : spring(card, 1),
    ]).start();
  }, [dialog]);

  const close = (button?: DialogButton) => {
    if (!shown || closing.current) return;
    closing.current = true;
    const reduced = isReducedMotion();
    Animated.parallel([reduced ? fade(backdrop, 0) : exit(backdrop, 0, T.close), reduced ? fade(card, 0) : exit(card, 0, T.close)]).start(() => {
      queue = queue.filter(entry => entry.id !== shown.id);
      setShown(null);
      emit();
      // Run the action after the dialog is gone so a following sheet never overlaps it.
      button?.onPress?.();
    });
  };
  const cancelButton = shown?.buttons.find(button => button.style === 'cancel');
  const cancelable = shown ? (shown.options.cancelable ?? (Boolean(cancelButton) || shown.buttons.length === 1)) : false;
  const dismiss = () => {if (cancelable) close(cancelButton ?? (shown?.buttons.length === 1 ? shown.buttons[0] : undefined));};

  useEffect(() => {
    if (!shown) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {dismiss(); return true;});
    return () => sub.remove();
  }, [shown, cancelable]);

  if (!shown) return null;
  const actions = shown.buttons.filter(button => button.style !== 'cancel');
  const ordered = cancelButton ? [cancelButton, ...actions] : actions;
  const stacked = ordered.length > 2;
  // Several warning lines ("A: …\nB: …") read better as separate rows than one paragraph.
  const lines = shown.message?.split('\n').filter(Boolean) ?? [];
  const reduced = isReducedMotion();
  const cardStyle = {
    opacity: card,
    transform: reduced ? [] : [
      {translateY: card.interpolate({inputRange: [0, 1], outputRange: [10, 0]})},
      {scale: card.interpolate({inputRange: [0, 1], outputRange: [SCALE.surface, 1]})},
    ],
  };
  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
    <Animated.View style={[StyleSheet.absoluteFill, {backgroundColor: '#11170CAC', opacity: backdrop}]} />
    <Pressable accessibilityLabel="Tutup dialog" style={StyleSheet.absoluteFill} onPress={dismiss} />
    <View pointerEvents="box-none" style={{flex: 1, justifyContent: 'center', paddingHorizontal: 22}}>
      <Animated.View accessibilityViewIsModal accessibilityRole="alert" style={[{backgroundColor: c.pale, borderRadius: 29, padding: 23, gap: 16}, cardStyle]}>
        {shown.options.icon && <View style={{width: 46, height: 46, borderRadius: 23, backgroundColor: c.lime, alignItems: 'center', justifyContent: 'center'}}>
          <Feather name={shown.options.icon} size={21} color={c.ink} />
        </View>}
        <View style={{gap: 8}}>
          <Text style={s.title}>{shown.title}</Text>
          {lines.length > 1
            ? <View style={{gap: 8, marginTop: 4}}>{lines.map((line, i) => <View key={i} style={{backgroundColor: c.white, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14}}><Text style={[s.body, {lineHeight: 19}]}>{line}</Text></View>)}</View>
            : lines.length === 1 ? <Text style={[s.body, {fontSize: 13, lineHeight: 20, color: '#4B5443'}]}>{lines[0]}</Text> : null}
        </View>
        <View style={stacked ? {gap: 9} : {flexDirection: 'row', gap: 9}}>
          {(stacked ? [...actions, ...(cancelButton ? [cancelButton] : [])] : ordered).map((button, i, list) =>
            <Choice key={`${button.text}-${i}`} button={button} full={stacked || list.length === 1} primary={button.style !== 'cancel' && (stacked ? i === 0 : i === list.length - 1)} onPress={() => close(button)} />)}
        </View>
      </Animated.View>
    </View>
  </Modal>;
}
