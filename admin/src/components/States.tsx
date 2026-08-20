import { AlertCircle, LoaderCircle, SearchX } from 'lucide-react';

export function LoadingState({ label = 'Loading data…' }: { label?: string }) {
  return <div className="state-box"><LoaderCircle className="animate-spin text-blue-600" size={24} /><span>{label}</span></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-box state-error">
      <AlertCircle size={24} />
      <div><strong>Could not load this view.</strong><p>{message}</p></div>
      {onRetry ? <button className="btn-secondary" onClick={onRetry}>Try again</button> : null}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="state-box"><SearchX size={24} className="text-slate-400" /><div><strong>{title}</strong><p>{detail}</p></div></div>;
}
