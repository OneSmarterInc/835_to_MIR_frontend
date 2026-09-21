import React from 'react';
import CenteredModal from './CenteredModal';

const CheckIcon = ({ ok }) => (
  <span style={{
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: ok ? '#18a38b' : '#b94a48',
    color: '#fff',
    fontWeight: '700',
    flexShrink: 0,
  }}>
    {ok ? '✓' : '✕'}
  </span>
);

export default function FeedbackModal({ isOpen, onClose, kind, title, content, checks }) {
  const passed = kind === 'ok';

  return (
    <CenteredModal isOpen={isOpen} onClose={onClose}>
      <div style={{
        background: '#111c2d',
        color: '#fff',
        margin: '-24px -24px 20px',
        padding: '22px 24px',
        borderBottom: '3px solid #18a38b',
      }}>
        <div style={{
          fontSize: '10px',
          letterSpacing: '0.15em',
          color: '#8fa3bd',
          textTransform: 'uppercase',
          marginBottom: '8px',
        }}>
          Compliance Evidence
        </div>
        <h2 style={{ margin: 0, fontSize: '22px', color: '#fff' }}>
          {title || 'Evidence Verification'}
        </h2>
      </div>

      <div style={{ color: '#172638' }}>
        <div style={{
          display: 'flex',
          gap: '12px',
          padding: '14px',
          border: '1px solid #c7d2de',
          background: '#f7f9fb',
          marginBottom: '16px',
          alignItems: 'center',
        }}>
          <CheckIcon ok={passed} />
          <div>
            <div style={{ fontWeight: 700 }}>
              {passed ? 'Evidence validated and stored successfully' : 'Evidence validation failed'}
            </div>
            <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
              {content}
            </div>
          </div>
        </div>

        {checks && checks.length > 0 && (
          <div>
            <div style={{
              fontSize: '11px',
              letterSpacing: '0.12em',
              color: '#64748b',
              fontWeight: 700,
              marginBottom: '10px',
              textTransform: 'uppercase',
            }}>
              Validation Checks ({checks.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {checks.map((c, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '12px',
                  border: '1px solid #dfe6ed',
                  background: '#fff',
                  borderRadius: '4px',
                }}>
                  <CheckIcon ok={c.ok} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>
                      {c.label}
                    </div>
                    <div style={{
                      marginTop: '4px',
                      color: '#64748b',
                      fontSize: '13px',
                      lineHeight: 1.5,
                    }}>
                      {c.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '22px' }}>
        <button type="button" className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </CenteredModal>
  );
}
