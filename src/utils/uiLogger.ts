export type UiLogLevel = "info" | "warn" | "error";

export type UiLogEntry = {
  level: UiLogLevel;
  message: string;
};

type UiLogListener = (entry: UiLogEntry) => void;

const listeners = new Set<UiLogListener>();

export function emitUiLog(level: UiLogLevel, message: string): void {
  if (!message) return;
  const entry: UiLogEntry = { level, message };
  for (const listener of listeners) {
    listener(entry);
  }
}

export function subscribeUiLog(listener: UiLogListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
