import { useState, useRef, useEffect } from "react";
import { useMarketStore } from "../../stores/useMarketStore";

const POPULAR_SYMBOLS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "SPY", "QQQ", "IWM",
  "AMD", "NFLX", "DIS", "BA", "JPM", "GS", "V", "MA", "PYPL", "SQ",
];

export function SymbolSearch() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setSymbol, currentSymbol } = useMarketStore();

  const filtered = query
    ? POPULAR_SYMBOLS.filter((s) =>
        s.toLowerCase().includes(query.toLowerCase())
      )
    : POPULAR_SYMBOLS;

  const handleSelect = (symbol: string) => {
    setSymbol(symbol);
    setQuery("");
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      handleSelect(query.trim().toUpperCase());
    }
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        if (active?.tagName !== "INPUT" && active?.tagName !== "TEXTAREA") {
          e.preventDefault();
          inputRef.current?.focus();
          setIsOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="symbol-search">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        onKeyDown={handleKeyDown}
        placeholder={`Search symbol (current: ${currentSymbol}) — press /`}
        className="symbol-input"
      />
      {isOpen && filtered.length > 0 && (
        <div className="symbol-dropdown">
          {filtered.slice(0, 10).map((s) => (
            <div
              key={s}
              className={`symbol-option ${s === currentSymbol ? "active" : ""}`}
              onMouseDown={() => handleSelect(s)}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
