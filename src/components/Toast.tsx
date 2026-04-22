import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

let toastId = 0;
const listeners = new Set<(toast: Toast) => void>();
const dismissListeners = new Set<(id: number) => void>();

export function showToast(message: string, type: ToastType = 'info') {
  const toast = { id: ++toastId, message, type };
  listeners.forEach((fn) => fn(toast));
  return toast.id;
}

export function showUndoToast(
  message: string,
  onUndo: () => void,
  options?: { duration?: number; onExpire?: () => void },
): number {
  const duration = options?.duration ?? 5000;
  const id = ++toastId;
  const toast: Toast = {
    id,
    message,
    type: 'info',
    duration,
    action: {
      label: 'Undo',
      onClick: () => {
        onUndo();
        dismissListeners.forEach((fn) => fn(id));
      },
    },
  };
  listeners.forEach((fn) => fn(toast));
  if (options?.onExpire) {
    setTimeout(() => options.onExpire?.(), duration);
  }
  return id;
}

const icons: Record<ToastType, React.FC<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const colors: Record<ToastType, string> = {
  success: 'text-emerald-400 border-emerald-600/30 bg-emerald-950/50',
  error: 'text-red-400 border-red-600/30 bg-red-950/50',
  info: 'text-cyan-400 border-cyan-600/30 bg-cyan-950/50',
};

const lightColors: Record<ToastType, string> = {
  success: 'text-emerald-700 border-emerald-200 bg-emerald-50',
  error: 'text-red-700 border-red-200 bg-red-50',
  info: 'text-cyan-700 border-cyan-200 bg-cyan-50',
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const isDark = document.documentElement.classList.contains('dark');

  useEffect(() => {
    const handler = (toast: Toast) => {
      setToasts((prev) => [...prev.slice(-4), toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, toast.duration ?? 4000);
    };
    const dismissHandler = (id: number) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    };
    listeners.add(handler);
    dismissListeners.add(dismissHandler);
    return () => {
      listeners.delete(handler);
      dismissListeners.delete(dismissHandler);
    };
  }, []);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-2 right-2 left-2 sm:left-auto sm:right-4 sm:bottom-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        const colorClass = isDark ? colors[toast.type] : lightColors[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg animate-in slide-in-from-right ${colorClass}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{toast.message}</span>
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="shrink-0 rounded px-2 py-0.5 text-xs font-medium underline underline-offset-2 hover:opacity-80"
              >
                {toast.action.label}
              </button>
            )}
            <button onClick={() => dismiss(toast.id)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

