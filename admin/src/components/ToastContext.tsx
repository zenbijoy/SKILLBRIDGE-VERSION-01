/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, 4500);
  }, [removeToast]);

  const success = useCallback((msg: string) => showToast(msg, 'success'), [showToast]);
  const error = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);
  const warning = useCallback((msg: string) => showToast(msg, 'warning'), [showToast]);
  const info = useCallback((msg: string) => showToast(msg, 'info'), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-xl border text-xs font-medium transition-all transform translate-y-0 backdrop-blur-md ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-100 border-emerald-700/60'
                : toast.type === 'error'
                ? 'bg-rose-950/90 text-rose-100 border-rose-700/60'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 text-amber-100 border-amber-700/60'
                : 'bg-slate-900/90 text-slate-100 border-slate-700/60'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
              {toast.type === 'error' && <AlertOctagon size={16} className="text-rose-400" />}
              {toast.type === 'warning' && <AlertTriangle size={16} className="text-amber-400" />}
              {toast.type === 'info' && <Info size={16} className="text-blue-400" />}
            </div>
            <div className="flex-1 leading-snug">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 text-slate-400 hover:text-white transition p-0.5"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
