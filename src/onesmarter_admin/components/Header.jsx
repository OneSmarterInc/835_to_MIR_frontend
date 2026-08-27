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

  const toggleDrawer = () => {
    const next = !drawerOpenRef.current;
    drawerOpenRef.current = next;
    setDrawerOpen(next);
    onToggleSidebar?.();
  };

  const closeDrawer = () => {
    if (!drawerOpenRef.current) return;
    drawerOpenRef.current = false;
    setDrawerOpen(false);
    onToggleSidebar?.();
  };

  useEffect(() => {
    // App starts with its sidebar state set to open; invert it once so the
    // drawer starts hidden and is revealed only by the left-edge hover.
    onToggleSidebar?.();

    const handleMouseMove = (event) => {
      const rail = document.querySelector('.shell > .rail');
      const insideDrawer = !!rail && rail.contains(event.target);

      if (event.clientX <= 24 && !drawerOpenRef.current) {
        drawerOpenRef.current = true;
        setDrawerOpen(true);
        onToggleSidebar?.();
        return;
      }

      if (drawerOpenRef.current && !insideDrawer && event.clientX > 24) {
        closeDrawer();
      }
    };

    const handleClick = (event) => {
      const rail = document.querySelector('.shell > .rail');
      if (!rail || !rail.contains(event.target)) return;

      const option = event.target.closest('a, button, [role="button"]');
      if (option) window.setTimeout(closeDrawer, 0);
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
          box-shadow: 4px 0 20px rgba(0, 0, 0, 0.24) !important;
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
          z-index: 999;
          pointer-events: none;
        }
      `}</style>

      <div className="admin-sidebar-edge-trigger" aria-hidden="true" />

      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            type="button"
            className="admin-hamburger-btn"
            onClick={toggleDrawer}
            title="Toggle Navigation Menu"
            aria-label="Toggle Navigation Menu"
            style={{
              background: 'none',
              border: 'none',
              color: '#B9C6D4',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <div className="wordmark">ONESMARTER <span>/ MIR RELAY ADMIN</span></div>
        </div>
        <div className="spacer"></div>
        <div className="me">
          <div className="av">{initials}</div>
          <div>
            <div>{displayTitle}</div>
            <div className="role">{role}</div>
          </div>
        </div>
        <button
          type="button"
          className="btn-topbar-logout"
          title="Sign Out"
          aria-label="Sign Out"
          onClick={onSignOut}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
            <line x1="12" y1="2" x2="12" y2="12"></line>
          </svg>
        </button>
      </div>
    </>
  );
}
