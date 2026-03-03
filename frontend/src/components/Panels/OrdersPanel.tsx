import { useEffect } from "react";
import { useOrderStore } from "../../stores/useOrderStore";
import { formatPrice, formatQty } from "../../utils/format";

export function OrdersPanel() {
  const { orders, loading, fetchOrders, cancelOrder, cancelAllOrders } =
    useOrderStore();

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <div className="panel orders-panel">
      <div className="panel-header">
        <h3>Orders {loading && <span className="loading">...</span>}</h3>
        {orders.length > 0 && (
          <button className="btn btn-small btn-danger" onClick={cancelAllOrders}>
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
              <th>Symbol</th>
              <th>Side</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Limit</th>
              <th>Stop</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="symbol">{order.symbol}</td>
                <td className={order.side === "buy" ? "buy-text" : "sell-text"}>
                  {order.side.toUpperCase()}
                </td>
                <td>{order.type}</td>
                <td>{formatQty(order.qty)}</td>
                <td>{formatPrice(order.limit_price)}</td>
                <td>{formatPrice(order.stop_price)}</td>
                <td className="status">{order.status}</td>
                <td>
                  {(order.status === "new" ||
                    order.status === "accepted" ||
                    order.status === "pending_new") && (
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => cancelOrder(order.id)}
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
