/**
 * DanaSiap's own confirm/alert dialogs, replacing the browser's window.confirm/alert so they share
 * the app's look and motion (they reuse <Modal>: grow from the trigger, blur in, close in 130 ms).
 */
import { useRef, useSyncExternalStore } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Modal } from "./components";
import { Presence } from "./motion";

type Request = {
  id: number;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  tone: "default" | "danger" | "info";
  resolve: (confirmed: boolean) => void;
};

let queue: Request[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const current = () => queue[0] ?? null;

/** Resolves true when the user confirms, false when they cancel or dismiss. */
export function confirmDialog(options: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [
      ...queue,
      {
        id: nextId++,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? "Lanjutkan",
        cancelText: options.cancelText ?? "Batal",
        tone: options.danger ? "danger" : "default",
        resolve,
      },
    ];
    emit();
  });
}

export function alertDialog(title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    queue = [
      ...queue,
      { id: nextId++, title, message, confirmText: "Oke", tone: "info", resolve: () => resolve() },
    ];
    emit();
  });
}

/** Render once near the root of the app. */
export function DialogHost() {
  const request = useSyncExternalStore(subscribe, current, current);
  const settled = useRef(new Set<number>());
  const finish = (entry: Request, confirmed: boolean) => {
    if (settled.current.has(entry.id)) return;
    settled.current.add(entry.id);
    queue = queue.filter((item) => item.id !== entry.id);
    emit();
    entry.resolve(confirmed);
  };
  return (
    <Presence when={request ? String(request.id) : null}>
      {(exiting) => {
        const entry = request ?? null;
        if (!entry) return null;
        const Icon = entry.tone === "info" ? Info : AlertTriangle;
        return (
          <Modal
            className="app-dialog"
            exiting={exiting}
            labelledBy={`app-dialog-${entry.id}`}
            close={() => finish(entry, false)}
          >
            <span className={`app-dialog-icon ${entry.tone}`} aria-hidden="true">
              <Icon size={20} />
            </span>
            <h2 id={`app-dialog-${entry.id}`}>{entry.title}</h2>
            <p>{entry.message}</p>
            <div className="app-dialog-actions">
              {entry.cancelText && (
                <button
                  type="button"
                  className="button light"
                  onClick={() => finish(entry, false)}
                >
                  {entry.cancelText}
                </button>
              )}
              <button
                type="button"
                autoFocus
                className={`button ${entry.tone === "danger" ? "danger-solid" : "dark"}`}
                onClick={() => finish(entry, true)}
              >
                {entry.confirmText}
              </button>
            </div>
          </Modal>
        );
      }}
    </Presence>
  );
}
