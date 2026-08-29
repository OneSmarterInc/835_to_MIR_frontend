import React, { useState, useEffect } from 'react';
import CenteredModal from './CenteredModal';
import { fetchNotes, addNote } from '../../services/api';
import '../StepNotesHistory.css';

function formatDateTime(dateVal) {
  if (!dateVal) return 'N/A';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return dateVal;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export default function NotesModal({ isOpen, onClose, clientId, stepKey, stepTitle }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);

  const [noteError, setNoteError] = useState('');

  useEffect(() => {
    if (isOpen && clientId && stepKey) {
      setNoteError('');
      loadNotes();
    }
  }, [isOpen, clientId, stepKey]);

  const loadNotes = async () => {
    try {
      const data = await fetchNotes(clientId, stepKey);
      setNotes(data.notes || []);
    } catch (e) {
      console.error('Failed to load notes', e);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setLoading(true);
    setNoteError('');
    try {
      await addNote(clientId, stepKey, newNote.trim());
      setNewNote('');
      await loadNotes();
      window.dispatchEvent(new CustomEvent('step-note-added', { detail: { clientId, stepKey } }));
      onClose(); // Close the modal immediately after saving
    } catch (e) {
      setNoteError(e.message || 'Failed to save note.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <CenteredModal isOpen={isOpen} onClose={onClose}>
      <div className="modal-t" id="notes-modal-title">Step Notes — {stepTitle || ''}</div>
      <div className="modal-b" id="notes-modal-subtitle">Internal notes recorded by administrators.</div>

      <section className="step-notes-history" id="notes-list-container" aria-label="Past notes">
        <div className="step-notes-history-title">
          <span>Past Notes</span>
          <span>{notes.length}</span>
        </div>
        <div className="step-notes-history-list">
        {notes.length === 0 ? (
          <div className="step-note-history-item" style={{ color: 'var(--ink-3)', fontSize: '12px' }}>No notes recorded for this step yet.</div>
        ) : (
          [...notes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((n) => (
            <article key={n.id} className="step-note-history-item">
              <div className="step-note-history-meta">
                <b>{n.author}</b>
                <span>{formatDateTime(n.created_at)}</span>
              </div>
              <div className="step-note-history-text">{n.note_text}</div>
            </article>
          ))
        )}
        </div>
      </section>

      <form onSubmit={handleAddNote}>
        <div className="field">
          <label>Add New Note</label>
          <textarea
            rows={3}
            placeholder="Enter note explaining progress, client discussions, or context…"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
        </div>
        {noteError && (
          <div style={{ color: 'var(--brick)', fontSize: '11.5px', marginTop: '6px' }}>
            ✕ {noteError}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </form>
    </CenteredModal>
  );
}
