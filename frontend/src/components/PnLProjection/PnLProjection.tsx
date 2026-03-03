interface Props {
  delta: number;
  gamma: number;
  theta: number;
  qty: number;
  entryPrice: number;
  spotPrice: number;
  optionType: "C" | "P";
}

const MOVES = [-5, -3, -2, -1, -0.5, 0.5, 1, 2, 3, 5];

export function PnLProjection({
  delta,
  gamma,
  theta,
  qty,
  entryPrice,
  spotPrice,
  optionType,
}: Props) {
  if (!entryPrice || !spotPrice || !delta) return null;

  const rows = MOVES.map((move) => {
    // Taylor expansion: optionChange ≈ delta * move + 0.5 * gamma * move²
    const optionChange = delta * move + 0.5 * gamma * move * move;
    const newOptionPrice = entryPrice + optionChange;
    const plPerContract = optionChange * 100;
    const totalPL = plPerContract * qty;
    const plPercent = (optionChange / entryPrice) * 100;

    return {
      underlyingPrice: spotPrice + move,
      move,
      newOptionPrice: Math.max(0, newOptionPrice),
      totalPL,
      plPercent,
    };
  });

  return (
    <div className="panel pnl-projection">
      <h3>P&L Projection</h3>

      <div className="pnl-meta">
        <span>
          {optionType === "C" ? "Call" : "Put"} | {qty} ct @ $
          {entryPrice.toFixed(2)}
        </span>
        <span>
          Δ {delta.toFixed(3)} | Γ {gamma.toFixed(4)} | Θ {theta.toFixed(3)}
        </span>
      </div>

      <table className="panel-table">
        <thead>
          <tr>
            <th>Price</th>
            <th>Move</th>
            <th>Option</th>
            <th>P&L ($)</th>
            <th>P&L (%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const plClass =
              row.totalPL > 0
                ? "positive"
                : row.totalPL < 0
                  ? "negative"
                  : "";
            return (
              <tr key={row.move} className={plClass}>
                <td>${row.underlyingPrice.toFixed(2)}</td>
                <td>
                  {row.move > 0 ? "+" : ""}
                  {row.move.toFixed(2)}
                </td>
                <td>${row.newOptionPrice.toFixed(2)}</td>
                <td>
                  {row.totalPL > 0 ? "+" : ""}
                  {row.totalPL.toFixed(0)}
                </td>
                <td>
                  {row.plPercent > 0 ? "+" : ""}
                  {row.plPercent.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
