import { type ReactNode } from "react";
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
  const setPanelOpen = useLayoutStore((s) => s.setPanelOpen);

  return (
    <div className={`panel ${className}`}>
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
