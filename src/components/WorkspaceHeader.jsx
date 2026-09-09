import React from 'react';
import './WorkspaceHeader.css';

export default function WorkspaceHeader({ eyebrow, title, description, children, className = '' }) {
  return (
    <header className={`workspace-header ${className}`.trim()}>
      <div className="workspace-header-copy">
        {eyebrow && <div className="workspace-header-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="workspace-header-controls">{children}</div>}
    </header>
  );
}
