import React, { useState } from "react";
import { isDemoModeEnabled, toggleDemoMode } from "../utils/demoSubstitution";

export default function Topbar({ user, onToggleDrawer, onLogout }) {
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(isDemoModeEnabled());

  const handleDemoToggle = () => {
    const next = !demoMode;
    setDemoMode(next);
    toggleDemoMode(next);
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-brand-group">
          <button type="button" className="btn-drawer-toggle" title="Toggle Navigation Menu" aria-label="Toggle navigation menu" onClick={onToggleDrawer}>
            ☰
          </button>
          <div className="wordmark">MIR Relay <span>/ Project835</span></div>
        </div>

        <div className="spacer" />

        {user && user.name && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
              Demo Data
              <input
                type="checkbox"
                checked={demoMode}
                onChange={handleDemoToggle}
                title="Enable demo data encoding"
              />
            </label>

            <div className="tenant">
              <span className="dot"></span>
              <span>{user.name}</span>
            </div>

            <button
              type="button"
              className="btn-topbar-logout"
              title="Logout"
              onClick={() => setIsLogoutConfirmOpen(true)}
            >
              Logout
            </button>
          </div>
        )}
      </div>

      {isLogoutConfirmOpen && (
        <div role="presentation" onClick={() => setIsLogoutConfirmOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 2147483647, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div role="dialog" onClick={(e) => e.stopPropagation()} style={{ background: "white", padding: "24px", borderRadius: "10px" }}>
            <div style={{ fontWeight: 700 }}>Confirm Logout</div>
            <p>Are you sure you want to log out?</p>
            <button onClick={() => setIsLogoutConfirmOpen(false)}>Cancel</button>
            <button onClick={async () => { setIsLogoutConfirmOpen(false); await onLogout?.(); }}>Logout</button>
          </div>
        </div>
      )}
    </>
  );
}
