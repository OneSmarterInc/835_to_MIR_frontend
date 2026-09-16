import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { safeFetchJson } from '../utils/api';
import './MplAnalyzeAgainAction.css';

const ACTIVE = new Set([
  'RECEIVED',
  'PARSING_EMAIL',
  'MATCHING_CLAIMS',
  'COLLECTING_EVIDENCE',
  'RUNNING_VALIDATIONS',
  'ANALYZING',
]);

function noticeIdFromUrl() {
  return new URLSearchParams(window.location.search).get('notice') || '';
}

export default function MplAnalyzeAgainAction() {
  const [noticeId, setNoticeId] = useState(noticeIdFromUrl);
  const [target, setTarget] = useState(null);
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const sync = () => {
      setNoticeId(noticeIdFromUrl());
      setTarget(document.querySelector('.mpl-detail-page-actions'));
    };
    sync();
    const timer = window.setInterval(sync, 300);
    window.addEventListener('popstate', sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => {
    if (!noticeId) {
      setStatus('');
      setSubmitting(false);
      setError('');
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${encodeURIComponent(noticeId)}/`);
      if (!cancelled && res.ok && data?.success) {
        setStatus(String(data.notice?.status || '').toUpperCase());
      }
    };
    load().catch(() => {});
    return () => { cancelled = true; };
  }, [noticeId]);

  useEffect(() => {
    if (!noticeId || (!submitting && !ACTIVE.has(status))) return undefined;
    let cancelled = false;

    const poll = async () => {
      const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${encodeURIComponent(noticeId)}/`);
      if (cancelled || !res.ok || !data?.success) return;
      const next = String(data.notice?.status || '').toUpperCase();
      setStatus(next);
      if (!ACTIVE.has(next)) {
        setSubmitting(false);
        window.location.reload();
      }
    };

    const timer = window.setInterval(() => { poll().catch(() => {}); }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [noticeId, status, submitting]);

  if (!noticeId || !target) return null;

  const busy = submitting || ACTIVE.has(status);
  const analyze = async () => {
    if (busy) return;
    setSubmitting(true);
    setError('');
    setStatus('RECEIVED');
    try {
      const { res, data } = await safeFetchJson(
        `/edi835/api/mpl-notices/${encodeURIComponent(noticeId)}/analyze/`,
        { method: 'POST' },
      );
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to start analysis.');
      }
      setStatus(String(data.notice?.status || 'RECEIVED').toUpperCase());
    } catch (reason) {
      setSubmitting(false);
      setStatus('');
      setError(reason?.message || 'Unable to start analysis.');
    }
  };

  return createPortal(
    <>
      <button
        type="button"
        className="mpl-btn primary mpl-persistent-analyze-again"
        onClick={analyze}
        disabled={busy}
        aria-busy={busy ? 'true' : undefined}
        title={busy ? 'Analysis is in progress' : 'Run the MPL analysis again'}
      >
        {busy ? 'Analyzing…' : 'Analyze Again'}
      </button>
      {error && <span className="mpl-analyze-again-error" role="alert">{error}</span>}
    </>,
    target,
  );
}
