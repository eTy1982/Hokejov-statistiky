import type { SyncState } from "../lib/sync";

interface Props {
  state: SyncState;
  pending: number;
  error?: string | undefined;
  onSync: () => void;
}

const LOOK: Record<SyncState, { label: string; className: string; dot: string }> = {
  idle: { label: "Synchronizováno", className: "bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400" },
  syncing: { label: "Synchronizuji…", className: "bg-ice-500/15 text-ice-300", dot: "bg-ice-400 animate-pulse" },
  offline: { label: "Offline", className: "bg-amber-500/15 text-amber-300", dot: "bg-amber-400" },
  error: { label: "Chyba synchronizace", className: "bg-rose-500/15 text-rose-300", dot: "bg-rose-400" },
  unauthenticated: { label: "Nepřihlášen", className: "bg-slate-500/15 text-slate-300", dot: "bg-slate-400" },
};

export function SyncBadge({ state, pending, error, onSync }: Props) {
  const look = LOOK[state];
  return (
    <button
      type="button"
      onClick={onSync}
      title={error ?? (pending ? `${pending} čeká na odeslání` : "Synchronizovat")}
      className={`chip ${look.className} transition hover:brightness-125`}
    >
      <span className={`h-2 w-2 rounded-full ${look.dot}`} />
      <span className="hidden sm:inline">{look.label}</span>
      {pending > 0 && <span className="tabular-nums">({pending})</span>}
    </button>
  );
}
