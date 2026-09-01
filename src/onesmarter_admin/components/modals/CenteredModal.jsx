import React from 'react';

export default function CenteredModal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div className="modal on" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2147483647 }}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
