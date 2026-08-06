import { useEffect, type ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ title, subtitle, onClose, children, footer, wide }: Props) {
  // Zavření Escapem a zákaz rolování pozadí, dokud je dialog otevřený.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-2xl ${
          wide ? "sm:max-w-5xl" : "sm:max-w-lg"
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-400">{subtitle}</div>}
          </div>
          <button className="btn-ghost !px-3" onClick={onClose} aria-label="Zavřít">
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
