import { useEffect } from "react";
import { useAccountStore } from "../../stores/useAccountStore";
import { formatPrice } from "../../utils/format";

export function AccountPanel() {
  const { account, loading, fetchAccount } = useAccountStore();

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  if (loading && !account) return <div className="panel">Loading account...</div>;
  if (!account) return <div className="panel">Failed to load account</div>;

  return (
    <div className="panel account-panel">
      <h3>Account</h3>
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
    </div>
  );
}
