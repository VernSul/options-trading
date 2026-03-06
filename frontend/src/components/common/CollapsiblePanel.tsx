import { useRef, useEffect, useCallback, type ReactNode } from "react";
import { useLayoutStore } from "../../stores/useLayoutStore";

interface Props {
  id: string;
  title: string;
  defaultOpen?: boolean;
  className?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function CollapsiblePanel({
  id,
  title,
  defaultOpen = true,
  className = "",
  headerRight,
  children,
}: Props) {
  const open = useLayoutStore((s) => s.panelOpen[id] ?? defaultOpen);
  const savedHeight = useLayoutStore((s) => s.panelHeight[id]);
  const setPanelOpen = useLayoutStore((s) => s.setPanelOpen);
  const setPanelHeight = useLayoutStore((s) => s.setPanelHeight);
  const ref = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef(0);

  // Restore saved height on mount
  useEffect(() => {
    if (ref.current && savedHeight && open) {
      ref.current.style.height = `${savedHeight}px`;
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Observe user resize (CSS resize: vertical) and persist
  const handleResize = useCallback(() => {
    if (!ref.current || !open) return;
    const h = ref.current.offsetHeight;
    // Only save when meaningfully different (debounce noise)
    if (h > 0 && Math.abs(h - lastHeightRef.current) > 2) {
      lastHeightRef.current = h;
      setPanelHeight(id, h);
    }
  }, [id, open, setPanelHeight]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    const observer = new ResizeObserver(handleResize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, handleResize]);

  return (
    <div ref={ref} className={`panel ${className}`}>
      <div
        className="panel-header clickable"
        onClick={() => setPanelOpen(id, !open)}
      >
        <h3>{title}</h3>
        <div className="panel-header-right">
          {headerRight}
          <span className="collapse-icon">{open ? "−" : "+"}</span>
        </div>
      </div>
      {open && children}
    </div>
  );
}
