import { useEffect, useState } from "react";

/** Tři rozvržení zápisu. Rozhoduje šířka okna, ne zařízení – Fold se
 *  rozkládá a zavírá za provozu a aplikace se musí přizpůsobit hned.
 *
 *  - `wide`  tablet na šířku: popisky sloupců, dialog vedle sebe
 *  - `fold`  Galaxy Z Fold rozložený (933 × 664): menší písmo
 *  - `cover` Fold zavřený (476 × 708): dvouřádková lišta, dialog po krocích
 */
export type LayoutSize = "wide" | "fold" | "cover";

export function layoutForWidth(width: number): LayoutSize {
  if (width >= 1100) return "wide";
  if (width >= 700) return "fold";
  return "cover";
}

export function useLayoutSize(): LayoutSize {
  const [size, setSize] = useState<LayoutSize>(() =>
    layoutForWidth(typeof window === "undefined" ? 1280 : window.innerWidth),
  );

  useEffect(() => {
    const update = () => setSize(layoutForWidth(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    // Rozložení Foldu mění i orientaci, ne vždy přijde resize.
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return size;
}
