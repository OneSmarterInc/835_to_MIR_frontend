import React, { useState } from "react";

export default function Topbar({ user, onToggleDrawer, onLogout, clientUser = false }) {
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const displayName = user?.name || user?.email || "Client User";
  const initials = displayName.split(" ").filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "CU";

  return (
    <>
      <div className={"topbar" + (clientUser ? " cu-portal-header" : "")}>
        {clientUser ? <>
          <div className="cu-topbar-brand">
            <button type="button" className="cu-header-menu" title="Toggle Navigation Menu"
              aria-label="Toggle Navigation Menu" onClick={onToggleDrawer}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div className="wordmark" style={{textTransform: "none"}}>
              <span style={{color: "#fff", fontWeight: "inherit"}}>F</span>ile<span
                style={{color: "#fff", fontWeight: "inherit"}}>X</span>
              <span className="cu-header-divider"> / CLIENT USER</span>
            </div>
          </div>
          <div className="spacer" />
          <div className="cu-user-profile">
            <span className="cu-header-avatar">{initials}</span>
            <div><div className="cu-header-name">{displayName}</div>
              <div className="cu-header-role">CLIENT USER</div>
            </div>
          </div>
          <button type="button" className="btn-topbar-logout" title="Sign Out"
            aria-label="Sign Out" onClick={() => setIsLogoutConfirmOpen(true)}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
          </button>
        </> : <>
        <div className="topbar-brand-group">
          <button type="button" className="btn-drawer-toggle" title="Toggle Navigation Menu" aria-label="Toggle navigation menu" onClick={onToggleDrawer}>
            ☰
          </button>
          <div className="wordmark" style={{ textTransform: "none" }}><span style={{ fontSize: "1.12em", color: "#fff", fontWeight: "inherit" }}>F</span>ile<span style={{ fontSize: "1.12em", fontWeight: "inherit", color: "#fff", lineHeight: "inherit", verticalAlign: "baseline", letterSpacing: "inherit" }}>X</span></div>
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
        </>}
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
