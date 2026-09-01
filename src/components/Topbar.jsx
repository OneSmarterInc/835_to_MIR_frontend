import React, { useState } from "react";

export default function Topbar({ user, onToggleDrawer, onLogout }) {
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  return (
    <>
    <div className="topbar">
      <div className="topbar-brand-group">
        <button
          type="button"
          className="btn-drawer-toggle"
          id="btnDrawerToggle"
          title="Toggle Navigation Menu"
          aria-label="Toggle navigation menu"
          onClick={onToggleDrawer}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <div className="wordmark">
          MIR Relay <span>/ Project835</span>
        </div>
      </div>
      <div className="spacer"></div>
      {user && user.name && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
              <line x1="12" y1="2" x2="12" y2="12"></line>
            </svg>
          </button>
        </div>
      )}
    </div>
      {isLogoutConfirmOpen && (
        <div
          role="presentation"
          onClick={() => setIsLogoutConfirmOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-logout-title"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "400px",
              background: "#fff",
              color: "#1f2937",
              borderRadius: "10px",
              padding: "24px",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div id="client-logout-title" style={{ fontSize: "20px", fontWeight: 700 }}>
              Confirm Logout
            </div>
            <div style={{ marginTop: "10px", color: "#5f6b78" }}>
              Are you sure you want to log out?
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "22px" }}>
              <button type="button" className="btn" onClick={() => setIsLogoutConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn danger" onClick={async () => {
                setIsLogoutConfirmOpen(false);
                await onLogout?.();
              }}>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}}
    </>
  );
}
