import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  defaultOpen?: boolean;
  className?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function CollapsiblePanel({
  title,
  defaultOpen = true,
  className = "",
  headerRight,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`panel ${className}`}>
      <div
        className="panel-header clickable"
        onClick={() => setOpen(!open)}
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
