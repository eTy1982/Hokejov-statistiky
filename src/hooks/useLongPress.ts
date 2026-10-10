import { useRef } from "react";

/** Krátký stisk zapisuje, dlouhý otevírá trest.
 *
 *  Žádná globální ochrana proti dvojkliku – ta v předchozí verzi zahazovala
 *  rychlé ťuky na různé hráče. Dvojité započtení řeší to, že akce visí na
 *  `pointerup` téhož prvku.
 */
const LONG_PRESS_MS = 550;

interface Options {
  onTap: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
}

export function useLongPress({ onTap, onLongPress, disabled }: Options) {
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      longFired.current = false;
      clear();
      if (!onLongPress) return;
      timer.current = window.setTimeout(() => {
        longFired.current = true;
        timer.current = null;
        navigator.vibrate?.([12, 40, 12]);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerUp: () => {
      if (disabled) return;
      const wasLong = longFired.current;
      clear();
      if (!wasLong) {
        navigator.vibrate?.(10);
        onTap();
      }
    },
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
