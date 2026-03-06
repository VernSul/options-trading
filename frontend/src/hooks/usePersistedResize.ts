import { useRef, useEffect, useCallback } from "react";
import { useLayoutStore } from "../stores/useLayoutStore";

/**
 * Observes CSS resize on an element and persists the size to localStorage.
 * Returns a ref to attach to the element.
 *
 * @param id unique key for this element
 * @param dimension "height" or "width"
 */
export function usePersistedResize<T extends HTMLElement>(
  id: string,
  dimension: "height" | "width"
) {
  const ref = useRef<T>(null);
  const savedHeight = useLayoutStore((s) => s.panelHeight[id]);
  const setPanelHeight = useLayoutStore((s) => s.setPanelHeight);
  const savedWidth = useLayoutStore((s) => s.rightColumnWidth);
  const setRightColumnWidth = useLayoutStore((s) => s.setRightColumnWidth);
  const lastRef = useRef(0);

  // Restore on mount
  useEffect(() => {
    if (!ref.current) return;
    if (dimension === "height" && savedHeight) {
      ref.current.style.height = `${savedHeight}px`;
    } else if (dimension === "width" && savedWidth) {
      ref.current.style.width = `${savedWidth}px`;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResize = useCallback(() => {
    if (!ref.current) return;
    const val =
      dimension === "height"
        ? ref.current.offsetHeight
        : ref.current.offsetWidth;
    if (val > 0 && Math.abs(val - lastRef.current) > 2) {
      lastRef.current = val;
      if (dimension === "height") {
        setPanelHeight(id, val);
      } else {
        setRightColumnWidth(val);
      }
    }
  }, [id, dimension, setPanelHeight, setRightColumnWidth]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(handleResize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleResize]);

  return ref;
}
