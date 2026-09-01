import React from 'react';

import { dateTimeZoneParts } from '../utils/timezone';

export default function TimeDisplay({ value, includeSeconds = false, easternOnly = false, className = '' }) {
  const parts = dateTimeZoneParts(value, { includeSeconds });
  if (!parts.valid) return <span className={className}>{parts.fallback}</span>;

  const rowStyle = {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: '5px',
    minWidth: 0,
  };
  const labelStyle = {
    color: 'var(--ink-3)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.02em',
  };

  return (
    <span
      className={`timezone-display ${className}`.trim()}
      style={{
        display: 'inline-grid',
        gap: '2px',
        maxWidth: '100%',
        minWidth: 0,
        lineHeight: 1.25,
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'left',
      }}
    >
      <span style={rowStyle}>
        <span style={labelStyle}>{parts.eastern.label}</span>
        <span>{parts.eastern.value}</span>
      </span>
      {!easternOnly && parts.local && (
        <span style={rowStyle}>
          <span style={labelStyle}>{parts.local.label}</span>
          <span>{parts.local.value}</span>
        </span>
      )}
    </span>
  );
}
