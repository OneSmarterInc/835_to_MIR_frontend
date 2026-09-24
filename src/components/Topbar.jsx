import React, { useState } from "react";

export default function Topbar({ user, onToggleDrawer, onLogout }) {
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
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
        <div
          className="logout-confirm-backdrop"
          role="presentation"
          onClick={() => setIsLogoutConfirmOpen(false)}
        >
          <div
            className="logout-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="logout-confirm-title" id="logout-confirm-title">Confirm Logout</div>
            <p className="logout-confirm-message">Are you sure you want to log out?</p>
            <div className="logout-confirm-actions">
              <button type="button" className="logout-confirm-cancel" onClick={() => setIsLogoutConfirmOpen(false)}>Cancel</button>
              <button type="button" className="logout-confirm-submit" onClick={async () => { setIsLogoutConfirmOpen(false); await onLogout?.(); }}>Logout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
