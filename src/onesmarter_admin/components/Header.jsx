import React, { useEffect } from 'react';

export default function Header({
  onSignOut,
  currentUser,
  onToggleSidebar,
  isSidebarOpen = false,
}) {
  const displayName = currentUser?.name || currentUser?.email || 'Sahil Asarkar';
  const initials = displayName.split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'SA';
  const role = currentUser?.role || 'CLIENT USER';
  const clientName = currentUser?.client || 'OneSmarter';
  const isSystemAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin' || currentUser?.is_staff || currentUser?.is_superuser;
  const displayTitle = isSystemAdmin ? displayName : clientName;

  useEffect(() => {
    const rail = document.querySelector('.shell > .rail');
    if (!rail) return;

    rail.style.setProperty('display', isSidebarOpen ? 'block' : 'none', 'important');
    rail.style.setProperty('transform', 'none', 'important');
    rail.style.setProperty('opacity', '1', 'important');
    rail.style.setProperty('pointer-events', isSidebarOpen ? 'auto' : 'none', 'important');
  }, [isSidebarOpen]);

  return (
    <>
      <style>{`
        .shell > .rail {
          position: fixed !important;
          top: 56px !important;
          left: 0 !important;
          bottom: 0 !important;
          width: 206px !important;
          height: calc(100vh - 56px) !important;
          z-index: 100 !important;
          flex: none !important;
          overflow-y: auto !important;
          background: #1D2938 !important;
          border-right: none !important;
          padding: 18px 0 !important;
          box-shadow: 4px 0 20px rgba(0, 0, 0, 0.24) !important;
          transform: none !important;
          opacity: 1 !important;
          pointer-events: auto !important;
          transition: none !important;
          animation: none !important;
          will-change: auto !important;
          font-family: var(--body) !important;
          color: #B9C6D4 !important;
        }
        .shell > .rail .grp {
          padding-left: 16px !important;
          padding-right: 16px !important;
          color: #6C7F94 !important;
        }
        .shell > .rail .navitem {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 8px !important;
          width: 100% !important;
          text-align: left !important;
          padding: 9px 16px !important;
          border-left: 2px solid transparent !important;
          color: #B9C6D4 !important;
          background: transparent !important;
          transition: none !important;
          animation: none !important;
        }
        .shell > .rail .navitem:hover {
          background: #243244 !important;
          color: #ffffff !important;
        }
        .shell > .rail .navitem.on {
          border-left-color: var(--ochre) !important;
          background: #243244 !important;
          color: #ffffff !important;
          font-weight: 600 !important;
        }
        .shell > .rail .navitem .count {
          font-family: var(--display) !important;
          font-size: 10px !important;
          background: var(--ochre) !important;
          color: #fff !important;
          border-radius: 9999px !important;
          padding: 1px 6px !important;
        }
        .shell > .main {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          flex: 1 1 100% !important;
        }
      `}</style>

      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button type="button" className="admin-hamburger-btn" onClick={onToggleSidebar} title="Toggle Navigation Menu" aria-label="Toggle Navigation Menu" style={{ background: 'none', border: 'none', color: '#B9C6D4', cursor: 'pointer', padding: '4px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="wordmark">ONESMARTER <span>/ MIR RELAY ADMIN</span></div>
        </div>
        <div className="spacer" />
        <div className="me"><div className="av">{initials}</div><div><div>{displayTitle}</div><div className="role">{role}</div></div></div>
        <button type="button" className="btn-topbar-logout" title="Sign Out" aria-label="Sign Out" onClick={onSignOut}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
        </button>
      </div>
    </>
  );
}
