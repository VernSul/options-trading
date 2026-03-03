import { useMarketStore } from "../../stores/useMarketStore";
import { formatPrice } from "../../utils/format";

export function StatusBar() {
  const { currentSymbol, latestQuote } = useMarketStore();

  return (
    <div className="status-bar">
      <span className="status-item">
        {currentSymbol}
        {latestQuote && (
          <>
            {" "}
            Bid: {formatPrice(latestQuote.bidPrice)} / Ask:{" "}
            {formatPrice(latestQuote.askPrice)}
          </>
        )}
      </span>
      <span className="status-item shortcuts-legend">
        <kbd>B</kbd> Call
        {" | "}
        <kbd>P</kbd> Put
        {" | "}
        <kbd>S</kbd> Sell
        {" | "}
        <kbd>?</kbd> Help
      </span>
    </div>
  );
}
