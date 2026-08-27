import React, { useEffect, useRef } from 'react';

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
  const openRef = useRef(isSidebarOpen);
  const initializedRef = useRef(false);
  const manualRef = useRef(false);

  const applyDrawer = (open) => {
    const rail = document.querySelector('.shell > .rail');
    if (rail) {
      rail.style.setProperty('display', 'block', 'important');
      rail.style.setProperty('transform', open ? 'translateX(0)' : 'translateX(-100%)', 'important');
      rail.style.setProperty('opacity', open ? '1' : '0', 'important');
      rail.style.setProperty('pointer-events', open ? 'auto' : 'none', 'important');
    }
  };

  const setDrawer = (open, syncState = true) => {
    if (openRef.current === open) {
      applyDrawer(open);
      return;
    }
    openRef.current = open;
    applyDrawer(open);
    if (syncState) onToggleSidebar?.();
  };

  useEffect(() => {
    openRef.current = isSidebarOpen;
    applyDrawer(isSidebarOpen);
  }, [isSidebarOpen]);

  useEffect(() => {
    const rail = document.querySelector('.shell > .rail');
    if (rail && !initializedRef.current) {
      initializedRef.current = true;
      // Start hidden; the left-edge hover opens the drawer.
      if (isSidebarOpen) {
        openRef.current = false;
        onToggleSidebar?.();
      }
      applyDrawer(false);
    }

    const handleMouseMove = (event) => {
      const currentRail = document.querySelector('.shell > .rail');
      if (!currentRail) return;

      const overDrawer = currentRail.contains(event.target);
      const overEdge = event.clientX <= 24;

      if (!openRef.current && overEdge) {
        manualRef.current = false;
        setDrawer(true);
        return;
      }

      // Keep the drawer open while the pointer is anywhere inside it.
      if (openRef.current && overDrawer) return;

      // Once the pointer leaves the drawer, close it. A tiny 24px edge zone
      // prevents accidental closing while moving from the edge into the menu.
      if (openRef.current && !overDrawer && !overEdge && !manualRef.current) {
        setDrawer(false);
      }
    };

    const handleClick = (event) => {
      const currentRail = document.querySelector('.shell > .rail');
      if (!currentRail || !currentRail.contains(event.target)) return;

      const option = event.target.closest('button, a, [role="button"]');
      if (!option) return;

      // Navigation selection closes the drawer after React updates the view.
      window.setTimeout(() => {
        manualRef.current = false;
        setDrawer(false);
      }, 150);
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleClick, true);
    };
  }, [onToggleSidebar]);

  const handleHamburger = () => {
    const next = !openRef.current;
    manualRef.current = next;
    setDrawer(next);
  };

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
          transform: translateX(-100%) !important;
          opacity: 0 !important;
          pointer-events: none !important;
          transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease !important;
          will-change: transform, opacity;
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
          transition: all 0.15s ease !important;
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
          <button type="button" className="admin-hamburger-btn" onClick={handleHamburger} title="Toggle Navigation Menu" aria-label="Toggle Navigation Menu" style={{ background: 'none', border: 'none', color: '#B9C6D4', cursor: 'pointer', padding: '4px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
