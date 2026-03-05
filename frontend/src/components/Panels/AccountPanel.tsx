import { useEffect } from "react";
import { useAccountStore } from "../../stores/useAccountStore";
import { usePositionStore } from "../../stores/usePositionStore";
import { formatPrice } from "../../utils/format";
import { CollapsiblePanel } from "../common/CollapsiblePanel";

export function AccountPanel() {
  const { account, loading, fetchAccount } = useAccountStore();
  const positions = usePositionStore((s) => s.positions);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  // Re-fetch account periodically when positions are open
  useEffect(() => {
    if (positions.length === 0) return;
    const interval = setInterval(fetchAccount, 10_000);
    return () => clearInterval(interval);
  }, [positions.length, fetchAccount]);

  if (loading && !account) return <div className="panel">Loading account...</div>;
  if (!account) return <div className="panel">Failed to load account</div>;

  return (
    <CollapsiblePanel title="Account" className="account-panel">
      <div className="account-grid">
        <div className="account-item">
          <span className="label">Equity</span>
          <span className="value">${formatPrice(account.equity)}</span>
        </div>
        <div className="account-item">
          <span className="label">Buying Power</span>
          <span className="value">${formatPrice(account.buying_power)}</span>
        </div>
        <div className="account-item">
          <span className="label">Cash</span>
          <span className="value">${formatPrice(account.cash)}</span>
        </div>
        <div className="account-item">
          <span className="label">Portfolio</span>
          <span className="value">${formatPrice(account.portfolio_value)}</span>
        </div>
        <div className="account-item">
          <span className="label">Day Trades</span>
          <span className="value">{account.daytrade_count}</span>
        </div>
        <div className="account-item">
          <span className="label">PDT</span>
          <span className={`value ${account.pattern_day_trader ? "negative" : "positive"}`}>
            {account.pattern_day_trader ? "Yes" : "No"}
          </span>
        </div>
      </div>
    </CollapsiblePanel>
  );
}
