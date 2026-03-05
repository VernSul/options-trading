// WS message envelope
export interface WSMessage {
  type: string;
  payload: unknown;
}

// Normalized bar (used throughout the app)
export interface Bar {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  vwap: number;
}

// Normalized stock quote
export interface StockQuote {
  symbol: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  timestamp: string;
}

// Normalized option quote
export interface OptionQuote {
  symbol: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  timestamp: string;
}

// Account - Alpaca uses snake_case JSON tags
export interface Account {
  id: string;
  account_number: string;
  status: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  pattern_day_trader: boolean;
  daytrade_count: number;
}

// Order - Alpaca uses snake_case JSON tags
export interface Order {
  id: string;
  client_order_id: string;
  symbol: string;
  side: string;
  type: string;
  time_in_force: string;
  status: string;
  qty: string | null;
  filled_qty: string;
  filled_avg_price: string | null;
  limit_price: string | null;
  stop_price: string | null;
  position_intent: string;
  created_at: string;
  filled_at: string | null;
}

// Position - Alpaca uses snake_case JSON tags
export interface Position {
  asset_id: string;
  symbol: string;
  qty: string;
  avg_entry_price: string;
  side: string;
  market_value: string | null;
  cost_basis: string;
  unrealized_pl: string | null;
  unrealized_plpc: string | null;
  current_price: string | null;
}

// Smart order request
export interface SmartOrderRequest {
  symbol: string;
  qty: number;
  side: string;
  type: string;
  positionIntent: string;
  limitPrice?: string;
  timeInForce: string;
  stopLoss?: {
    stopPrice: string;
    limitPrice?: string;
  };
  trailingStop?: {
    trailAmount: string;
    safetyStop: string;
    startPercent: string;
    offsetPercent: string;
  };
  takeProfit?: {
    limitPrice: string;
  };
}

// Crossing alert
export interface CrossingAlert {
  id: string;
  underlying: string;
  thresholdPrice: string;
  direction: "above" | "below";
  optionSymbol: string;
  qty: number;
  side: string;
  positionIntent: string;
  orderType: string;
  limitPrice?: string;
  triggered: boolean;
}

// Option chain snapshot - Alpaca REST uses short JSON tags
export interface OptionSnapshot {
  latestTrade?: {
    t: string;  // Timestamp
    p: number;  // Price
    s: number;  // Size
  } | null;
  latestQuote?: {
    t: string;  // Timestamp
    bp: number; // BidPrice
    bs: number; // BidSize
    ap: number; // AskPrice
    as: number; // AskSize
  } | null;
  impliedVolatility?: number;
  greeks?: {
    delta: number;
    gamma: number;
    rho: number;
    theta: number;
    vega: number;
  } | null;
}

export type OptionChain = Record<string, OptionSnapshot>;

// Trade update from WS - Alpaca uses snake_case JSON tags
export interface TradeUpdate {
  at: string;
  event: string;
  order: Order;
  price: string | null;
  qty: string | null;
}

// Trailing stop
export interface TrailingStopUpdate {
  orderId: string;
  symbol: string;
  qty: number;
  trailAmount: string;
  highWater: string;
  active: boolean;
  fired: boolean;
  entryPrice: string;
  startPercent: string;
  offsetPercent: string;
  stopPrice: string;
  safetyStop: string;
}

// Round-trip trade from backend
export interface TradeRecord {
  symbol: string;
  side: string;
  qty: string;
  entryPrice: string;
  exitPrice: string | null;
  pnl: string | null;
  pnlPercent: string | null;
  entryTime: string;
  exitTime: string | null;
  status: "open" | "closed";
  exitReason: string; // trailing, stop_loss, manual, or empty
  entryOrderId: string;
  exitOrderId: string;
  positionIntent: string;
}
