import React, { useEffect, useRef, useState } from 'react';

const OPTIONS = [
  { type: 'mir', title: 'MIR files', detail: 'Download all generated .mir files' },
  { type: '835', title: '835 source files', detail: 'Download all .x12 and .835 files' },
  { type: 'both', title: 'Complete archive', detail: 'Download MIR and 835 files together', featured: true },
];

export default function ArchiveZipMenu({ onDownload }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const selectOption = (type) => {
    setOpen(false);
    onDownload(type);
  };

  return (
    <div className="archive-zip" ref={rootRef}>
      <button
        type="button"
        className="btn-gray archive-zip-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title="Download archive as ZIP"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h6l2 2h8v14H4V4Zm8 5v6m-3-3 3 3 3-3" />
        </svg>
        <span>ZIP Archive</span>
        <svg className={`archive-zip-chevron${open ? ' open' : ''}`} viewBox="0 0 20 20" aria-hidden="true">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div className="archive-zip-menu" role="menu" aria-label="ZIP archive download options">
          <div className="archive-zip-menu-heading">Choose archive contents</div>
          {OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              role="menuitem"
              className={`archive-zip-option${option.featured ? ' featured' : ''}`}
              onClick={() => selectOption(option.type)}
            >
              <span className="archive-zip-option-icon" aria-hidden="true">↓</span>
              <span>
                <strong>{option.title}</strong>
                <small>{option.detail}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
