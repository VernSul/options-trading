import { useState } from "react";
import {
  useSettingsStore,
  type Direction,
  type OffsetType,
  type Timeframe,
} from "../../stores/useSettingsStore";

export function SettingsPanel() {
  const [collapsed, setCollapsed] = useState(true);
  const settings = useSettingsStore();

  return (
    <div className="panel settings-panel">
      <div
        className="panel-header clickable"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3>Settings</h3>
        <span className="collapse-icon">{collapsed ? "+" : "−"}</span>
      </div>

      {!collapsed && (
        <div className="settings-grid">
          <label className="setting-item">
            <span>Direction</span>
            <select
              className="select"
              value={settings.defaultDirection}
              onChange={(e) =>
                settings.setDefaultDirection(e.target.value as Direction)
              }
            >
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </label>

          <label className="setting-item">
            <span>DTE (days)</span>
            <input
              type="number"
              className="input"
              value={settings.defaultExpDays}
              onChange={(e) =>
                settings.setDefaultExpDays(parseInt(e.target.value) || 1)
              }
              min={0}
            />
          </label>

          <label className="setting-item">
            <span>Strike Offset</span>
            <input
              type="number"
              className="input"
              value={settings.strikeOffset}
              onChange={(e) =>
                settings.setStrikeOffset(parseInt(e.target.value) || 0)
              }
              min={0}
            />
          </label>

          <label className="setting-item">
            <span>Offset Type</span>
            <select
              className="select"
              value={settings.strikeOffsetType}
              onChange={(e) =>
                settings.setStrikeOffsetType(e.target.value as OffsetType)
              }
            >
              <option value="OTM">OTM</option>
              <option value="ITM">ITM</option>
              <option value="ATM">ATM</option>
            </select>
          </label>

          <label className="setting-item">
            <span>$ Amount</span>
            <input
              type="number"
              className="input"
              value={settings.dollarAmount}
              onChange={(e) =>
                settings.setDollarAmount(parseInt(e.target.value) || 100)
              }
              min={1}
              step={100}
            />
          </label>

          <label className="setting-item">
            <span>Stop Loss %</span>
            <input
              type="number"
              className="input"
              value={(settings.stopLossPercent * 100).toFixed(0)}
              onChange={(e) =>
                settings.setStopLossPercent(
                  (parseFloat(e.target.value) || 0) / 100
                )
              }
              min={0}
              max={100}
              step={5}
            />
          </label>

          <label className="setting-item">
            <span>Trail %</span>
            <input
              type="number"
              className="input"
              value={(settings.trailingStopPercent * 100).toFixed(0)}
              onChange={(e) =>
                settings.setTrailingStopPercent(
                  (parseFloat(e.target.value) || 0) / 100
                )
              }
              min={0}
              max={100}
              step={5}
            />
          </label>

          <label className="setting-item">
            <span>Timeframe</span>
            <select
              className="select"
              value={settings.defaultTimeframe}
              onChange={(e) =>
                settings.setDefaultTimeframe(e.target.value as Timeframe)
              }
            >
              <option value="1Min">1m</option>
              <option value="5Min">5m</option>
              <option value="15Min">15m</option>
              <option value="1H">1H</option>
              <option value="1D">1D</option>
            </select>
          </label>

          <label className="setting-item">
            <span>Chain Range</span>
            <input
              type="number"
              className="input"
              value={settings.chainStrikesRange}
              onChange={(e) =>
                settings.setChainStrikesRange(parseInt(e.target.value) || 5)
              }
              min={3}
              max={30}
            />
          </label>
        </div>
      )}
    </div>
  );
}
