import React, { useEffect, useMemo, useState } from 'react';
import { fetchNotes } from '../services/api';
import './StepNotesHistory.css';

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StepNotesHistory({ clientId, stepKey, latestNote }) {
  const [notes, setNotes] = useState(latestNote ? [latestNote] : []);
  const [expanded, setExpanded] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const handleNoteAdded = (event) => {
      if (event.detail?.clientId === clientId && event.detail?.stepKey === stepKey) {
        setReloadToken((value) => value + 1);
      }
    };
    window.addEventListener('step-note-added', handleNoteAdded);
    return () => window.removeEventListener('step-note-added', handleNoteAdded);
  }, [clientId, stepKey]);

  useEffect(() => {
    let active = true;
    if (!clientId || !stepKey) {
      setNotes([]);
      return () => { active = false; };
    }

    setNotes(latestNote ? [latestNote] : []);
    fetchNotes(clientId, stepKey)
      .then((data) => {
        if (active) setNotes(data.notes || []);
      })
      .catch(() => {
        // Keep the latest note supplied with the step if history cannot be loaded.
      });

    return () => { active = false; };
  }, [clientId, stepKey, latestNote, reloadToken]);

  const orderedNotes = useMemo(
    () => [...notes].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
    [notes]
  );

  if (!orderedNotes.length) return null;

  const visibleNotes = expanded ? orderedNotes : orderedNotes.slice(0, 3);
  const hiddenCount = Math.max(orderedNotes.length - 3, 0);

  return (
    <section className={`step-notes-history${expanded ? ' expanded' : ''}`} aria-label="Past notes">
      <div className="step-notes-history-title">
        <span>Past Notes</span>
        <span>{orderedNotes.length}</span>
      </div>
      <div className="step-notes-history-list">
        {visibleNotes.map((note, index) => (
          <article className="step-note-history-item" key={note.id || `${note.created_at || 'note'}-${index}`}>
            <div className="step-note-history-meta">
              <b>{note.author || 'Administrator'}</b>
              {note.created_at && <span>{formatDateTime(note.created_at)}</span>}
            </div>
            <div className="step-note-history-text">{note.note_text}</div>
          </article>
        ))}
      </div>
      {orderedNotes.length > 3 && (
        <button
          type="button"
          className="step-notes-history-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? '▲ Show less' : `▼ Show more (${hiddenCount})`}
        </button>
      )}
    </section>
  );
}
