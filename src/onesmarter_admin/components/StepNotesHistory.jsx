import React, { useEffect, useMemo, useState } from 'react';
import { deleteNote, fetchNotes } from '../services/api';
import './StepNotesHistory.css';
import TimeDisplay from '../../components/TimeDisplay';

export default function StepNotesHistory({ clientId, stepKey, latestNote }) {
  const [notes, setNotes] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');

  const handleDelete = async (note) => {
    if (!note.id || deletingId || !window.confirm('Delete this note?')) return;
    try {
      setDeletingId(note.id);
      setError('');
      await deleteNote(clientId, stepKey, note.id);
      setNotes((current) => current.filter((item) => item.id !== note.id));
    } catch (err) {
      setError(err.message || 'Failed to delete note.');
    } finally {
      setDeletingId(null);
    }
  };

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
    setNotes([]);
    setExpanded(false);
  }, [clientId, stepKey]);

  useEffect(() => {
    let active = true;
    if (!clientId || !stepKey) {
      setNotes([]);
      return () => { active = false; };
    }

    if (latestNote) {
      setNotes((current) => {
        const duplicate = current.some((note) =>
          (latestNote.id && note.id === latestNote.id) ||
          (!latestNote.id && note.note_text === latestNote.note_text && note.author === latestNote.author)
        );
        return duplicate ? current : [latestNote, ...current];
      });
    }
    fetchNotes(clientId, stepKey)
      .then((data) => {
        if (active) {
          const fetchedNotes = data.notes || [];
          setNotes(fetchedNotes.length ? fetchedNotes : (latestNote ? [latestNote] : []));
        }
      })
      .catch(() => {
        // Keep the latest note supplied with the step if history cannot be loaded.
      });

    return () => { active = false; };
  }, [clientId, stepKey, latestNote?.id, latestNote?.note_text, latestNote?.author, reloadToken]);

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
              <span className="step-note-history-actions">
                {note.created_at && <TimeDisplay value={note.created_at} />}
                {note.id && <button type="button" onClick={() => handleDelete(note)} disabled={deletingId === note.id} title="Delete note" aria-label="Delete note">🗑</button>}
              </span>
            </div>
            <div className="step-note-history-text">{note.note_text}</div>
          </article>
        ))}
      </div>
      {error && <div className="step-note-history-error">{error}</div>}
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
