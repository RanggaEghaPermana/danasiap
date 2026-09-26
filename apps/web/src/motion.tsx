/**
 * DanaSiap motion system. One motion language for the whole web app:
 * containers morph, contents cross-blur, menus stagger in, money flies to where it goes.
 * Tokens mirror MOTION_SPEC (spring 380/30, pop spring 500/22, exit easing, blur/scale/slide amounts).
 * Only transform-type properties, opacity and filter are animated, except the size of a
 * morphing container (a few small pills and the dialog), which is what the spec asks for.
 */
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

/** General spring (stiffness 380, damping 30), 450 ms. */
export const SPRING =
  "linear(0, 0.034 1.4%, 0.14 3%, 0.521 8.4%, 0.722 11.4%, 0.87 14.6%, 0.964 18%, 1.017 21.6%, 1.038 25.2%, 1.04 28.9%, 1.025 34.5%, 1.004 42.3%, 0.997 50.4%, 1)";
/** Pop spring for icons and landing values (stiffness 500, damping 22), 560 ms. */
export const POP =
  "linear(0, 0.14 4.5%, 0.435 9.1%, 0.737 13.6%, 0.977 18.2%, 1.116 22.7%, 1.167 27.3%, 1.154 31.8%, 1.109 36.4%, 1.057 40.9%, 1.013 45.5%, 0.985 50%, 0.973 54.5%, 0.979 63.6%, 0.996 72.7%, 1.004 81.8%, 1.002 95.5%, 1)";
export const EXIT = "cubic-bezier(0.4, 0, 1, 1)";
export const SPRING_MS = 450;
export const POP_MS = 560;
/** Old content leaving a morphing container. */
export const SWAP_EXIT_MS = 160;
/** Menus, dialogs, toasts closing. */
export const CLOSE_MS = 130;
export const REDUCED_MS = 150;

const reducedQuery =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
export const reducedMotion = () => Boolean(reducedQuery?.matches);

// ---------------------------------------------------------------------------
// Layers: keep old content mounted while it animates out.
// ---------------------------------------------------------------------------

interface Layer {
  key: string;
  id: number;
  exiting: boolean;
}

let layerIds = 0;

/**
 * Tracks which keyed layers are on screen. When `key` changes the current layer is marked
 * exiting and removed after `exitMs`; the new key becomes the current layer.
 * The render callback of every layer is remembered so an exiting layer keeps rendering
 * what it last showed.
 */
function useLayers(key: string | null, render: (exiting: boolean) => ReactNode, exitMs: number) {
  const [layers, setLayers] = useState<Layer[]>(() =>
    key == null ? [] : [{ key, id: ++layerIds, exiting: false }],
  );
  const renders = useRef(new Map<number, (exiting: boolean) => ReactNode>());
  const current = layers.find((l) => !l.exiting);
  let shown = layers;
  if ((current?.key ?? null) !== key) {
    shown = layers
      .filter((l) => !(l.exiting && l.key === key))
      .map((l) => (l.exiting ? l : { ...l, exiting: true }));
    if (key != null) shown = [...shown, { key, id: ++layerIds, exiting: false }];
    setLayers(shown);
  }
  const live = shown.find((l) => !l.exiting);
  if (live) renders.current.set(live.id, render);
  const exitingCount = layers.filter((l) => l.exiting).length;
  useEffect(() => {
    if (!exitingCount) return;
    const timer = setTimeout(() => {
      setLayers((all) => {
        const next = all.filter((l) => !l.exiting);
        for (const id of renders.current.keys())
          if (!next.some((l) => l.id === id)) renders.current.delete(id);
        return next;
      });
    }, reducedMotion() ? REDUCED_MS : exitMs);
    return () => clearTimeout(timer);
  }, [layers, exitingCount, exitMs]);
  return shown.map((layer) => ({
    ...layer,
    node: (renders.current.get(layer.id) ?? render)(layer.exiting),
  }));
}

const ExitingContext = createContext(false);
/** True while the surrounding <Presence> layer is animating out. */
export const useExiting = () => useContext(ExitingContext);

/**
 * Mount/unmount with an exit animation. `when` is falsy to hide, otherwise a key
 * (true, or a string that re-creates the content when it changes).
 * Children is a render function receiving `exiting`.
 */
export function Presence({
  when,
  exitMs = CLOSE_MS,
  children,
}: {
  when: string | boolean | null | undefined;
  exitMs?: number;
  children: (exiting: boolean) => ReactNode;
}) {
  const key = when ? String(when) : null;
  const layers = useLayers(key, children, exitMs);
  return (
    <>
      {layers.map((layer) => (
        <ExitingContext.Provider value={layer.exiting} key={layer.id}>
          {layer.node}
        </ExitingContext.Provider>
      ))}
    </>
  );
}

/**
 * MORPH content swap (pattern 1). Old content blurs + fades + shrinks out (160 ms, exit easing)
 * while new content sharpens + grows in from 6 px away, starting 80 ms later (spring).
 * The container itself can spring to its new size with `morph`.
 */
export function MorphSwap({
  swapKey,
  children,
  className = "",
  layerClassName = "",
  morph,
  as: Tag = "div",
  containerRef,
  resetScroll = false,
  ...rest
}: {
  swapKey: string;
  children: ReactNode;
  className?: string;
  layerClassName?: string;
  morph?: "width" | "height" | "both";
  as?: "div" | "nav" | "section" | "span";
  containerRef?: RefObject<HTMLElement | null>;
  /** Scroll the closest scroll container (e.g. a dialog) back to the top on swap. */
  resetScroll?: boolean;
} & Record<`data-${string}` | `aria-${string}`, string | undefined>) {
  const ownRef = useRef<HTMLElement>(null);
  const ref = containerRef ?? ownRef;
  useAutoMorph(ref, morph);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  const layers = useLayers(swapKey, () => children, SWAP_EXIT_MS);
  const swapping = layers.length > 1;
  const lastKey = useRef(swapKey);
  useLayoutEffect(() => {
    if (lastKey.current === swapKey) return;
    lastKey.current = swapKey;
    if (resetScroll) ref.current?.closest("dialog")?.scrollTo({ top: 0 });
  }, [swapKey]);
  return (
    <Tag
      ref={ref as RefObject<HTMLDivElement>}
      className={`m-swap ${swapping ? "is-swapping" : ""} ${className}`}
      {...rest}
    >
      {layers.map((layer) => {
        const Layer = Tag === "span" ? "span" : "div";
        return (
          <Layer
            key={layer.id}
            className={`m-layer ${layerClassName} ${layer.exiting ? "m-exit" : mounted.current ? "m-enter" : ""}`}
            inert={layer.exiting || undefined}
            aria-hidden={layer.exiting || undefined}
          >
            {layer.node}
          </Layer>
        );
      })}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Collapse: expanding sections push their neighbours smoothly
// ---------------------------------------------------------------------------

/** Neighbours slide back up a little slower than the content blurs out, so nothing snaps. */
export const COLLAPSE_EXIT_MS = 240;
const COLLAPSE_EXIT = "cubic-bezier(0.4, 0, 0.2, 1)";

function CollapseBody({ exiting, children }: { exiting: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const animate = (from: number, to: number, duration: number, easing: string) => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    el.classList.add("is-collapsing");
    const run = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing, fill: "forwards" });
    run.onfinish = () => {
      if (exiting) return;
      run.cancel();
      el.classList.remove("is-collapsing");
    };
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) animate(0, el.scrollHeight, SPRING_MS, SPRING);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (exiting && el) animate(el.offsetHeight, 0, COLLAPSE_EXIT_MS, COLLAPSE_EXIT);
  }, [exiting]);
  return (
    <div ref={ref} className="m-collapse">
      {children}
    </div>
  );
}

/**
 * Like <Presence>, but the section's height springs open and eases shut, so everything
 * below it moves with it instead of jumping.
 */
export function Collapse({
  when,
  children,
}: {
  when: string | boolean | null | undefined;
  children: (exiting: boolean) => ReactNode;
}) {
  return (
    <Presence when={when} exitMs={COLLAPSE_EXIT_MS}>
      {(exiting) => <CollapseBody exiting={exiting}>{children(exiting)}</CollapseBody>}
    </Presence>
  );
}

// ---------------------------------------------------------------------------
// Container size morph
// ---------------------------------------------------------------------------

/**
 * Springs an element from its previous border-box size to its new one whenever its
 * content changes size. Uses ResizeObserver, so the jump is caught before paint.
 */
export function useAutoMorph(
  ref: RefObject<HTMLElement | null>,
  axis: "width" | "height" | "both" | undefined,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !axis || typeof ResizeObserver === "undefined") return;
    let last: { w: number; h: number } | null = null;
    let running: Animation | null = null;
    const measure = () => ({ w: el.offsetWidth, h: el.offsetHeight });
    const animate = (from: { w: number; h: number }, to: { w: number; h: number }) => {
      const dw = axis !== "height" && Math.abs(from.w - to.w) > 1;
      const dh = axis !== "width" && Math.abs(from.h - to.h) > 1;
      last = to;
      if ((!dw && !dh) || reducedMotion()) return;
      const frames: Keyframe[] = [{}, {}];
      if (dw) {
        frames[0].width = `${from.w}px`;
        frames[1].width = `${to.w}px`;
      }
      if (dh) {
        frames[0].height = `${from.h}px`;
        frames[1].height = `${to.h}px`;
      }
      el.classList.add("is-morphing");
      running = el.animate(frames, { duration: SPRING_MS, easing: SPRING });
      const done = running;
      running.onfinish = running.oncancel = () => {
        if (running !== done) return;
        running = null;
        el.classList.remove("is-morphing");
        // Content may have changed again while we were animating.
        const now = measure();
        if (last && (Math.abs(now.w - last.w) > 1 || Math.abs(now.h - last.h) > 1))
          animate(last, now);
      };
    };
    const observer = new ResizeObserver(() => {
      if (running) return; // Our own animation is resizing the element.
      // A section inside is already springing its own height; follow it instead of competing.
      if (el.querySelector(".m-collapse.is-collapsing")) {
        last = measure();
        return;
      }
      const now = measure();
      if (!last) {
        last = now;
        return;
      }
      animate(last, now);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      running?.cancel();
    };
  }, [ref, axis]);
}

// ---------------------------------------------------------------------------
// Tab indicator (pattern 6)
// ---------------------------------------------------------------------------

/**
 * A background pill that slides (position + size, spring) to the selected child of its parent.
 * Render it as a child of the tab group; the group gets `m-has-indicator`.
 */
export function TabIndicator({
  active,
  className = "",
  selector = ".selected, .active, [aria-selected='true']",
}: {
  active: unknown;
  className?: string;
  selector?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const place = (animate: boolean) => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const target = parent.querySelector<HTMLElement>(`:scope > :is(${selector})`);
    if (!target) {
      el.style.opacity = "0";
      return;
    }
    if (!animate) el.style.transition = "none";
    el.style.opacity = "1";
    el.style.width = `${target.offsetWidth}px`;
    el.style.height = `${target.offsetHeight}px`;
    el.style.translate = `${target.offsetLeft}px ${target.offsetTop}px`;
    if (!animate) {
      void el.offsetWidth;
      el.style.transition = "";
    }
  };
  const placed = useRef(false);
  useLayoutEffect(() => {
    place(placed.current);
    placed.current = true;
  }, [active, selector]);
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    let size = "";
    const observer = new ResizeObserver(() => {
      const next = `${parent.offsetWidth}x${parent.offsetHeight}`;
      if (next === size) return;
      size = next;
      // Also runs once on mount: a group that was hidden (e.g. in a dialog not yet open)
      // measured 0 during the first layout.
      place(false);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  return <span ref={ref} className={`m-indicator ${className}`} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Value change (pattern 7) + fly to target (pattern 8)
// ---------------------------------------------------------------------------

const holds = new Map<string, number>();
const holdRemaining = (key?: string) =>
  key ? Math.max(0, (holds.get(key) ?? 0) - performance.now()) : 0;

/**
 * Text/number that never swaps instantly: the old value blurs out upward, the new one
 * blurs in from below. With `hold`, a value that is being flown in (flyTo) waits for the
 * chip to land, then pops.
 */
export function AnimatedValue({ value, hold }: { value: string; hold?: string }) {
  const [shown, setShown] = useState(value);
  const [previous, setPrevious] = useState<{ text: string; id: number } | null>(null);
  const [version, setVersion] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (value === shown) return;
    const swap = (landed: boolean) => {
      setPrevious({ text: shown, id: version });
      setShown(value);
      setVersion((v) => v + 1);
      if (landed) popElement(ref.current, 1.04);
    };
    const wait = holdRemaining(hold);
    if (!wait) return swap(false);
    const timer = setTimeout(() => swap(true), wait);
    return () => clearTimeout(timer);
  }, [value, shown, hold, version]);
  useEffect(() => {
    if (!previous) return;
    const timer = setTimeout(() => setPrevious(null), reducedMotion() ? REDUCED_MS : SWAP_EXIT_MS + 10);
    return () => clearTimeout(timer);
  }, [previous]);
  return (
    <span className="m-value" ref={ref}>
      <span key={version} className={version ? "m-value-in" : undefined}>
        {shown}
      </span>
      {previous && (
        <span key={`old${previous.id}`} className="m-value-out" aria-hidden="true">
          {previous.text}
        </span>
      )}
    </span>
  );
}

/** Pop an element (scale `from` → 1) with the pop spring. */
export function popElement(el: Element | null, from = 0.6) {
  if (!el || reducedMotion()) return;
  el.animate([{ scale: from }, { scale: 1 }], {
    duration: from > 1 ? SPRING_MS : POP_MS,
    easing: from > 1 ? SPRING : POP,
  });
}

const FLY_MS = 500;

const onScreen = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
};

/**
 * A chip with the amount ("+Rp 30.000") detaches from `source` and springs to the first
 * visible `[data-fly-target=…]` among `targets`, shrinking to 0.6 and fading as it lands.
 * If no target is on screen it floats up from the source instead.
 */
export function flyTo(source: Element | null, text: string, targets: string[]) {
  if (!source || reducedMotion()) return;
  const from = source.getBoundingClientRect();
  const landAt = performance.now() + FLY_MS * 0.8;
  for (const key of targets) holds.set(key, landAt);
  // Wait one frame: the target may only appear after React commits the change.
  requestAnimationFrame(() => {
    const target = targets
      .map((key) => document.querySelector(`[data-fly-target="${key}"]`))
      .find((el): el is Element => Boolean(el && onScreen(el)));
    const chip = document.createElement("div");
    chip.className = "fly-chip";
    chip.textContent = text;
    chip.setAttribute("aria-hidden", "true");
    document.body.append(chip);
    const sx = from.left + from.width / 2 - chip.offsetWidth / 2;
    const sy = from.top + from.height / 2 - chip.offsetHeight / 2;
    chip.style.left = `${sx}px`;
    chip.style.top = `${sy}px`;
    let dx = 0;
    let dy = -56;
    if (target) {
      const to = target.getBoundingClientRect();
      dx = to.left + Math.min(to.width, 160) / 2 - (sx + chip.offsetWidth / 2);
      dy = to.top + to.height / 2 - (sy + chip.offsetHeight / 2);
    }
    // Travel on the spring; size/opacity on their own timeline so the fade lands at the end.
    chip.animate([{ translate: "0 0" }, { translate: `${dx}px ${dy}px` }], {
      duration: FLY_MS,
      easing: SPRING,
      fill: "forwards",
    });
    const look = chip.animate(
      [
        { opacity: 0, scale: 0.94, filter: "blur(6px)", offset: 0 },
        { opacity: 1, scale: 1, filter: "blur(0px)", offset: 0.16 },
        { opacity: 1, scale: 0.9, offset: 0.62 },
        { opacity: 0, scale: 0.6, filter: "blur(2px)", offset: 1 },
      ],
      { duration: FLY_MS + 40, easing: "ease-out", fill: "forwards" },
    );
    look.onfinish = () => chip.remove();
    // If nothing is holding the number (value already shown), still pop the target on landing.
    if (target)
      setTimeout(() => {
        const value = target.querySelector(".m-value") ?? target;
        if (!target.isConnected) return;
        if (!value.getAnimations().length) popElement(value, 1.04);
      }, FLY_MS * 0.8 + 60);
  });
}

// ---------------------------------------------------------------------------
// Press feedback (pattern 5), trigger origin, list appear/exit helpers
// ---------------------------------------------------------------------------

const PRESSABLE =
  "button, .button, [role='tab'], [role='option'], label.item-photo, .chip-button";

let lastPointer: { x: number; y: number; at: number } | null = null;

/** Where the user last pressed (for dialogs growing from their trigger). */
export function triggerPoint(): { x: number; y: number } | null {
  if (lastPointer && performance.now() - lastPointer.at < 1500) return lastPointer;
  const active = document.activeElement;
  if (active && active !== document.body) {
    const r = active.getBoundingClientRect();
    if (r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}

/** Installs press-in/spring-out feedback for every pressable in the document. */
export function usePressFeedback() {
  useEffect(() => {
    let pressed: { el: HTMLElement; anim: Animation } | null = null;
    const press = (el: HTMLElement) => {
      release();
      if (reducedMotion()) return;
      const anim = el.animate([{ scale: 1 }, { scale: 0.95 }], {
        duration: 80,
        easing: "ease-out",
        fill: "forwards",
      });
      pressed = { el, anim };
    };
    const release = () => {
      if (!pressed) return;
      const { el, anim } = pressed;
      pressed = null;
      const now = getComputedStyle(el).scale;
      anim.cancel();
      el.animate([{ scale: now === "none" ? 1 : now }, { scale: 1 }], {
        duration: SPRING_MS,
        easing: SPRING,
      });
    };
    const pressable = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest<HTMLElement>(PRESSABLE) : null;
      if (!el || (el as HTMLButtonElement).disabled || el.closest(".m-exit, [inert]")) return null;
      return el;
    };
    const down = (e: PointerEvent) => {
      lastPointer = { x: e.clientX, y: e.clientY, at: performance.now() };
      if (e.button !== 0) return;
      const el = pressable(e.target);
      if (el) press(el);
    };
    const keyDown = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        lastPointer = null;
        const el = pressable(e.target);
        if (el && el.tagName !== "INPUT") press(el);
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", keyDown, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("keyup", release, true);
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("keyup", release, true);
      window.removeEventListener("blur", release);
    };
  }, []);
}

/**
 * Returns a class for list rows: rows whose key appears after the list first rendered get
 * the appear animation (pattern 9); rows present from the start stay still.
 */
export function useAppear(keys: string[]) {
  const seen = useRef<Set<string> | null>(null);
  const fresh = useRef(new Map<string, number>());
  const first = seen.current === null;
  const known = seen.current ?? new Set(keys);
  const now = performance.now();
  for (const key of keys)
    if (!first && !known.has(key) && !fresh.current.has(key))
      fresh.current.set(key, now + SPRING_MS + 100);
  useEffect(() => {
    seen.current = new Set(keys);
    for (const [key, until] of fresh.current)
      if (until < performance.now()) fresh.current.delete(key);
  });
  return (key: string) => ((fresh.current.get(key) ?? 0) > now ? "m-appear" : "");
}

/** Animate an element out (pattern 3), then run `done` (e.g. remove it from state). */
export function exitThen(el: Element | null, done: () => void) {
  if (!el) return done();
  const reduced = reducedMotion();
  const anim = el.animate(
    reduced
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          { opacity: 1, filter: "blur(0px)", scale: 1 },
          { opacity: 0, filter: "blur(6px)", scale: 0.96 },
        ],
    { duration: reduced ? REDUCED_MS : CLOSE_MS, easing: reduced ? "linear" : EXIT, fill: "forwards" },
  );
  anim.onfinish = done;
}

/**
 * Keyboard/pointer behaviour for a pill that morphs into a row of actions:
 * focus moves to the first action when it opens, Escape or a press outside closes it,
 * and focus returns to the trigger when it closes from the keyboard.
 */
export function useMorphMenu(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: (open: boolean) => void,
  { first, trigger }: { first: string; trigger: string },
) {
  const wasOpen = useRef(false);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const live = (selector: string) =>
      root.querySelector<HTMLElement>(`.m-layer:not(.m-exit) ${selector}`);
    if (!open) {
      const active = document.activeElement;
      if (wasOpen.current && (!active || active === document.body || root.contains(active)))
        live(trigger)?.focus({ preventScroll: true });
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    live(first)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);
}
