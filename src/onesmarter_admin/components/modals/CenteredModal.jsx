import React from 'react';

export default function CenteredModal({ isOpen, children }) {
  if (!isOpen) return null;

  return (
    // Only the dialog's explicit controls may close it. Backdrop clicks and
    // pointer gestures must not discard an in-progress form.
    <div className="modal on">
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
