import type { OptionChain } from "../types";
import type { Direction, OffsetType } from "../stores/useSettingsStore";
import { parseOCC } from "./occ";

export interface AutoSelectResult {
  occSymbol: string;
  strike: number;
  type: "C" | "P";
  askPrice: number;
  delta: number;
  gamma: number;
  theta: number;
}

interface AutoSelectParams {
  spotPrice: number;
  direction: Direction;
  strikeOffset: number;
  strikeOffsetType: OffsetType;
  chain: OptionChain;
  expiration: string;
}

export function autoSelectOption(
  params: AutoSelectParams
): AutoSelectResult | null {
  const { spotPrice, direction, strikeOffset, strikeOffsetType, chain, expiration } =
    params;

  const targetType: "C" | "P" = direction === "call" ? "C" : "P";

  // Filter chain to target type and expiration
  const candidates: {
    sym: string;
    strike: number;
    askPrice: number;
    delta: number;
    gamma: number;
    theta: number;
  }[] = [];

  for (const [sym, snap] of Object.entries(chain)) {
    const parsed = parseOCC(sym);
    if (!parsed) continue;
    if (parsed.type !== targetType) continue;
    if (parsed.expiration !== expiration) continue;

    candidates.push({
      sym,
      strike: parsed.strike,
      askPrice: snap.latestQuote?.ap ?? 0,
      delta: snap.greeks?.delta ?? 0,
      gamma: snap.greeks?.gamma ?? 0,
      theta: snap.greeks?.theta ?? 0,
    });
  }

  if (candidates.length === 0) return null;

  // Sort by strike ascending
  candidates.sort((a, b) => a.strike - b.strike);

  // Find ATM index (closest to spot)
  let atmIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const diff = Math.abs(candidates[i].strike - spotPrice);
    if (diff < minDiff) {
      minDiff = diff;
      atmIdx = i;
    }
  }

  if (strikeOffsetType === "ATM") {
    const c = candidates[atmIdx];
    return {
      occSymbol: c.sym,
      strike: c.strike,
      type: targetType,
      askPrice: c.askPrice,
      delta: c.delta,
      gamma: c.gamma,
      theta: c.theta,
    };
  }

  // Determine offset direction
  // OTM calls = higher strikes, OTM puts = lower strikes
  // ITM calls = lower strikes, ITM puts = higher strikes
  let targetIdx: number;

  if (strikeOffsetType === "OTM") {
    if (targetType === "C") {
      targetIdx = atmIdx + strikeOffset; // higher strikes for OTM calls
    } else {
      targetIdx = atmIdx - strikeOffset; // lower strikes for OTM puts
    }
  } else {
    // ITM
    if (targetType === "C") {
      targetIdx = atmIdx - strikeOffset; // lower strikes for ITM calls
    } else {
      targetIdx = atmIdx + strikeOffset; // higher strikes for ITM puts
    }
  }

  // Clamp to valid range
  targetIdx = Math.max(0, Math.min(candidates.length - 1, targetIdx));

  const c = candidates[targetIdx];
  return {
    occSymbol: c.sym,
    strike: c.strike,
    type: targetType,
    askPrice: c.askPrice,
    delta: c.delta,
    gamma: c.gamma,
    theta: c.theta,
  };
}
