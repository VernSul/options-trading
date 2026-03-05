// OCC symbol format: SYMBOL + 6 digit date (YYMMDD) + C/P + 8 digit price (strike * 1000, zero-padded)
// Example: AAPL240315C00182500 = AAPL 2024-03-15 Call $182.50

export function buildOCC(
  underlying: string,
  expiration: string, // YYYY-MM-DD
  type: "C" | "P",
  strike: number
): string {
  const padded = underlying.padEnd(6, " ").substring(0, 6);
  const [y, m, d] = expiration.split("-");
  const date = y.slice(2) + m + d;
  const priceStr = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${padded}${date}${type}${priceStr}`.replace(/ /g, " ");
}

export function parseOCC(occ: string): {
  underlying: string;
  expiration: string;
  type: "C" | "P";
  strike: number;
} | null {
  // OCC symbols are 21 chars: 6 underlying + 6 date + 1 type + 8 price
  const trimmed = occ.trim();
  if (trimmed.length < 15) return null;

  const priceStr = trimmed.slice(-8);
  const type = trimmed.slice(-9, -8) as "C" | "P";
  const dateStr = trimmed.slice(-15, -9);
  const underlying = trimmed.slice(0, -15).trim();

  const strike = parseInt(priceStr, 10) / 1000;
  const yy = dateStr.slice(0, 2);
  const mm = dateStr.slice(2, 4);
  const dd = dateStr.slice(4, 6);
  const expiration = `20${yy}-${mm}-${dd}`;

  return { underlying, expiration, type, strike };
}

export function occDTE(expiration: string): number {
  const exp = new Date(expiration + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / 86400000));
}

// Compact label: "C 230 2d" or "P 145.5 0d"
export function occCompact(symbol: string): { label: string; typeClass: string } | null {
  const info = parseOCC(symbol);
  if (!info) return null;
  const dte = occDTE(info.expiration);
  const strikeStr = info.strike % 1 === 0 ? String(info.strike) : info.strike.toFixed(1);
  return {
    label: `${info.type} ${strikeStr} ${dte}d`,
    typeClass: info.type === "C" ? "buy-text" : "sell-text",
  };
}
