import React, { useEffect, useRef, useState } from 'react';

export default function Header({ onSignOut, currentUser, onToggleSidebar }) {
  const displayName = currentUser?.name || currentUser?.email || 'Sahil Asarkar';
  const initials = displayName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'SA';
  const role = currentUser?.role || 'CLIENT USER';
  const clientName = currentUser?.client || 'OneSmarter';
  const isSystemAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin' || currentUser?.is_staff || currentUser?.is_superuser;
  const displayTitle = isSystemAdmin ? displayName : clientName;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerOpenRef = useRef(false);

  const setDrawerState = (open) => {
    drawerOpenRef.current = open;
    setDrawerOpen(open);
  };

  const toggleDrawer = () => {
    const next = !drawerOpenRef.current;
    setDrawerState(next);
    onToggleSidebar?.();
  };

  useEffect(() => {
    // The shell starts with the rail visible; hide it so it behaves as an overlay drawer.
    if (onToggleSidebar) onToggleSidebar();

    const isPointerOverDrawer = (event) => {
      const rail = document.querySelector('.shell > .rail');
      return !!rail && (rail.contains(event.target) || event.clientX <= 220);
    };

    const handleMouseMove = (event) => {
      // Open from the left edge.
      if (event.clientX <= 24 && !drawerOpenRef.current) {
        setDrawerState(true);
        onToggleSidebar?.();
        return;
      }

      // Never close while the cursor is anywhere inside the drawer.
      // Close only after the pointer has actually left the drawer.
      if (drawerOpenRef.current && !isPointerOverDrawer(event) && event.clientX > 220) {
        setDrawerState(false);
        onToggleSidebar?.();
      }
    };

    const handleClick = (event) => {
      const rail = document.querySelector('.shell > .rail');
      if (!rail || !rail.contains(event.target)) return;
      const option = event.target.closest('a, button, [role="button"]');
      if (option) {
        window.setTimeout(() => {
          if (drawerOpenRef.current) {
            setDrawerState(false);
            onToggleSidebar?.();
          }
        }, 150);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleClick, true);
    };
  }, [onToggleSidebar]);

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
          z-index: 1000 !important;
          flex: none !important;
          overflow-y: auto !important;
          box-shadow: 4px 0 20px rgba(0,0,0,.24) !important;
          transition: transform 220ms ease, opacity 180ms ease !important;
        }
        .shell > .main {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          flex: 1 1 100% !important;
        }
        .admin-sidebar-edge-trigger {
          position: fixed;
          top: 56px;
          left: 0;
          bottom: 0;
          width: 24px;
          z-index: 1001;
          pointer-events: none;
        }
        .shell > .rail > * { transition: opacity 160ms ease; }
      `}</style>

      <div className="admin-sidebar-edge-trigger" aria-hidden="true" />
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button type="button" className="admin-hamburger-btn" onClick={toggleDrawer} title="Toggle Navigation Menu" aria-label="Toggle Navigation Menu" style={{ background: 'none', border: 'none', color: '#B9C6D4', cursor: 'pointer', padding: '4px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="wordmark">ONESMARTER <span>/ MIR RELAY ADMIN</span></div>
        </div>
        <div className="spacer"></div>
        <div className="me"><div className="av">{initials}</div><div><div>{displayTitle}</div><div className="role">{role}</div></div></div>
        <button type="button" className="btn-topbar-logout" title="Sign Out" aria-label="Sign Out" onClick={onSignOut}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
        </button>
      </div>
    </>
  );
}
