interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: "/", desc: "Focus symbol search" },
  { key: "Tab", desc: "Next symbol" },
  { key: "Shift+Tab", desc: "Previous symbol" },
  { key: "1-9", desc: "Set quantity" },
  { key: "X", desc: "Close current position" },
  { key: "Escape", desc: "Cancel all orders" },
  { key: "?", desc: "Toggle this help" },
];

export function KeyboardHelp({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard Shortcuts</h2>
        <table className="shortcuts-table">
          <tbody>
            {SHORTCUTS.map(({ key, desc }) => (
              <tr key={key}>
                <td>
                  <kbd>{key}</kbd>
                </td>
                <td>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
