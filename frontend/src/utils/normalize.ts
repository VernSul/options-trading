import type { Bar, StockQuote, OptionQuote } from "../types";

// REST bars use short tags: t, o, h, l, c, v, n, vw
// WS bars use PascalCase: Symbol, Open, High, Low, Close, Volume, Timestamp, TradeCount, VWAP
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeBar(raw: any): Bar {
  return {
    symbol: raw.S || raw.Symbol || "",
    timestamp: raw.t || raw.Timestamp || "",
    open: raw.o ?? raw.Open ?? 0,
    high: raw.h ?? raw.High ?? 0,
    low: raw.l ?? raw.Low ?? 0,
    close: raw.c ?? raw.Close ?? 0,
    volume: raw.v ?? raw.Volume ?? 0,
    tradeCount: raw.n ?? raw.TradeCount ?? 0,
    vwap: raw.vw ?? raw.VWAP ?? 0,
  };
}

// REST quotes use short tags: S, bp, bs, ap, as, t
// WS quotes use PascalCase: Symbol, BidPrice, BidSize, AskPrice, AskSize, Timestamp
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeStockQuote(raw: any): StockQuote {
  return {
    symbol: raw.S || raw.Symbol || "",
    bidPrice: raw.bp ?? raw.BidPrice ?? 0,
    bidSize: raw.bs ?? raw.BidSize ?? 0,
    askPrice: raw.ap ?? raw.AskPrice ?? 0,
    askSize: raw.as ?? raw.AskSize ?? 0,
    timestamp: raw.t || raw.Timestamp || "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeOptionQuote(raw: any): OptionQuote {
  return {
    symbol: raw.S || raw.Symbol || "",
    bidPrice: raw.bp ?? raw.BidPrice ?? 0,
    bidSize: raw.bs ?? raw.BidSize ?? 0,
    askPrice: raw.ap ?? raw.AskPrice ?? 0,
    askSize: raw.as ?? raw.AskSize ?? 0,
    timestamp: raw.t || raw.Timestamp || "",
  };
}

// Normalize an array of REST bars
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeBars(rawBars: any[]): Bar[] {
  return rawBars.map(normalizeBar);
}
