import { useEffect } from "react";
import { useOrderStore } from "../../stores/useOrderStore";
import { formatPrice, formatQty } from "../../utils/format";
import { occCompact } from "../../utils/occ";

function intentShort(intent: string): string {
  switch (intent) {
    case "buy_to_open": return "BTO";
    case "sell_to_close": return "STC";
    case "sell_to_open": return "STO";
    case "buy_to_close": return "BTC";
    default: return intent;
  }
}

export function OrdersPanel() {
  const { orders, loading, fetchOrders, cancelOrder, cancelAllOrders } =
    useOrderStore();

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleCancel = (id: string) => {
    useOrderStore.setState((state) => ({
      orders: state.orders.filter((o) => o.id !== id),
    }));
    cancelOrder(id);
    setTimeout(fetchOrders, 1500);
  };

  const handleCancelAll = () => {
    useOrderStore.setState({ orders: [] });
    cancelAllOrders();
    setTimeout(fetchOrders, 1500);
    setTimeout(fetchOrders, 4000);
  };

  return (
    <div className="panel orders-panel">
      <div className="panel-header">
        <h3>Orders {loading && <span className="loading">...</span>}</h3>
        {orders.length > 0 && (
          <button className="btn btn-small btn-danger" onClick={handleCancelAll}>
            Cancel All
          </button>
        )}
      </div>
      {orders.length === 0 ? (
        <div className="empty">No open orders</div>
      ) : (
        <table className="panel-table">
          <thead>
            <tr>
              <th>Option</th>
              <th>Intent</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const occ = occCompact(order.symbol);
              const priceLabel = order.limit_price
                ? formatPrice(order.limit_price)
                : order.stop_price
                  ? formatPrice(order.stop_price)
                  : "MKT";
              return (
                <tr key={order.id}>
                  <td title={order.symbol}>
                    {occ ? (
                      <span className={occ.typeClass}>{occ.label}</span>
                    ) : (
                      <span className="symbol">{order.symbol}</span>
                    )}
                  </td>
                  <td className={order.side === "buy" ? "buy-text" : "sell-text"}>
                    {intentShort(order.position_intent)}
                  </td>
                  <td>{formatQty(order.qty)}</td>
                  <td>{priceLabel}</td>
                  <td className="status">{order.status}</td>
                  <td>
                    {(order.status === "new" ||
                      order.status === "accepted" ||
                      order.status === "pending_new") && (
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => handleCancel(order.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
