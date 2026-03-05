import {
  useSettingsStore,
  type Direction,
  type OffsetType,
  type Timeframe,
} from "../../stores/useSettingsStore";
import { CollapsiblePanel } from "../common/CollapsiblePanel";

export function SettingsPanel() {
  const settings = useSettingsStore();

  return (
    <CollapsiblePanel id="settings" title="Settings" className="settings-panel" defaultOpen={false}>
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
            onChange={(e) => {
              const v = parseInt(e.target.value);
              settings.setDefaultExpDays(isNaN(v) ? 0 : v);
            }}
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
            type="text"
            inputMode="numeric"
            className="input"
            value={settings.dollarAmount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "");
              settings.setDollarAmount(parseInt(v) || 0);
            }}
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
          <span>Take Profit %</span>
          <input
            type="number"
            className="input"
            value={(settings.takeProfitPercent * 100).toFixed(0)}
            onChange={(e) =>
              settings.setTakeProfitPercent(
                (parseFloat(e.target.value) || 0) / 100
              )
            }
            min={0}
            max={1000}
            step={10}
          />
        </label>

        <label className="setting-item">
          <span>Trail Start %</span>
          <input
            type="number"
            className="input"
            value={(settings.trailingStartPercent * 100).toFixed(0)}
            onChange={(e) =>
              settings.setTrailingStartPercent(
                (parseFloat(e.target.value) || 0) / 100
              )
            }
            min={0}
            max={100}
            step={1}
          />
        </label>

        <label className="setting-item">
          <span>Trail Offset %</span>
          <input
            type="number"
            className="input"
            value={(settings.trailingOffsetPercent * 100).toFixed(0)}
            onChange={(e) =>
              settings.setTrailingOffsetPercent(
                (parseFloat(e.target.value) || 0) / 100
              )
            }
            min={0}
            max={100}
            step={1}
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

        <label className="setting-item">
          <span>Projections</span>
          <select
            className="select"
            value={settings.showProjections ? "on" : "off"}
            onChange={(e) =>
              settings.setShowProjections(e.target.value === "on")
            }
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>

        <label className="setting-item">
          <span>Ext. Hours</span>
          <select
            className="select"
            value={settings.showExtendedHours ? "on" : "off"}
            onChange={(e) =>
              settings.setShowExtendedHours(e.target.value === "on")
            }
          >
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </label>
      </div>
    </CollapsiblePanel>
  );
}
