import React, { useEffect, useRef, useState } from 'react';

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
  const [hoverDrawer, setHoverDrawer] = useState(false);

  useEffect(() => {
    openRef.current = isSidebarOpen;
  }, [isSidebarOpen]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      const rail = document.querySelector('.shell > .rail');
      const overRail = !!rail && rail.contains(event.target);
      const overEdge = event.clientX <= 18;

      if ((overEdge || overRail) && !openRef.current) {
        openRef.current = true;
        setHoverDrawer(true);
        onToggleSidebar?.();
      } else if (!overRail && !overEdge && openRef.current && hoverDrawer) {
        openRef.current = false;
        setHoverDrawer(false);
        onToggleSidebar?.();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [hoverDrawer, onToggleSidebar]);

  useEffect(() => {
    const handleClick = (event) => {
      const rail = document.querySelector('.shell > .rail');
      if (!rail || !rail.contains(event.target)) return;
      const option = event.target.closest('a, button, [role="button"]');
      if (option) {
        window.setTimeout(() => {
          openRef.current = false;
          setHoverDrawer(false);
          onToggleSidebar?.();
        }, 150);
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
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
          z-index: 100 !important;
          flex: none !important;
          overflow-y: auto !important;
          box-shadow: 4px 0 20px rgba(0, 0, 0, 0.24) !important;
          transition: transform 220ms ease, opacity 180ms ease, box-shadow 220ms ease !important;
          will-change: transform, opacity;
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
