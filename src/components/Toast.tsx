import { useEffect } from "react";

const VISIBLE_MS = 3500;

export interface ToastState {
  /** Mění se s každým zápisem, aby se oznámení znovu objevilo i se stejným textem. */
  id: number;
  text: string;
  canUndo: boolean;
}

interface Props {
  toast: ToastState | null;
  onUndo: () => void;
  onClose: () => void;
}

/** Potvrzení každého zápisu. iPad nevibruje, takže je to jediná jistá odezva,
 *  že se ťuknutí povedlo – a zároveň nejkratší cesta zpět, když ne. */
export function Toast({ toast, onUndo, onClose }: Props) {
  const id = toast?.id;

  useEffect(() => {
    if (id === undefined) return;
    const timer = window.setTimeout(onClose, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [id, onClose]);

  if (!toast) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-2 z-40 flex justify-center px-2"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border border-white/15 bg-night-950/95 px-3 py-2 text-sm shadow-lg shadow-black/40 backdrop-blur">
        <span className="truncate">{toast.text}</span>
        {toast.canUndo && (
          <button
            className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-slate-100 hover:bg-white/20"
            onClick={() => {
              onUndo();
              onClose();
            }}
          >
            Vrátit
          </button>
        )}
      </div>
    </div>
  );
}
