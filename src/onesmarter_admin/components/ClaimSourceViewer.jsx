import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { portalFetch } from '../../utils/api';
import '../../pages/NoticesView.css';

const statusLabel = value => String(value || '').replaceAll('_', ' ');
const dateLabel = value => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v10m0 0 4-4m-4 4-4-4M5 16.5v3h14v-3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function filenameFromResponse(response, fallbackName) {
  const disposition = response.headers.get('content-disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const quoted = disposition.match(/filename="([^"]+)"/i);
  return encoded ? decodeURIComponent(encoded[1]) : quoted?.[1] || fallbackName;
}

async function downloadBlobResponse(response, fallbackName) {
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filenameFromResponse(response, fallbackName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

function viewerLines(rawContent, fileType) {
  const content = String(rawContent || '').replace(/\r\n?/g, '\n');
  const type = String(fileType || '').toUpperCase();
  if (type === 'MIR') {
    const physicalRows = content.split('\n').filter(line => line.length);
    if (physicalRows.length > 1) return physicalRows;
    const inferredRows = content.split(/(?=HI\d{15,})/).filter(Boolean);
    return inferredRows.length ? inferredRows : [content];
  }
  if (!['835', '837'].includes(type)) return content.split('\n');
  const delimiter = content.startsWith('ISA') && content.length > 105 ? content[105] : '~';
  const claimTag = type === '835' ? 'CLP' : 'CLM';
  const segments = content.split(delimiter).map(segment => segment.trim()).filter(Boolean);
  const lines = [];
  let envelope = [];
  let claim = [];
  const flushClaim = () => { if (claim.length) { lines.push(claim.join(delimiter) + delimiter); claim = []; } };
  const flushEnvelope = () => { if (envelope.length) { lines.push(envelope.join(delimiter) + delimiter); envelope = []; } };
  segments.forEach(segment => {
    const tag = segment.split('*', 1)[0].toUpperCase();
    if (tag === claimTag) {
      flushClaim();
      flushEnvelope();
      claim = [segment];
      return;
    }
    if (claim.length) claim.push(segment);
    else envelope.push(segment);
  });
  flushClaim();
  flushEnvelope();
  return lines;
}

const countOccurrences = (content, value) => {
  const term = String(value || '').trim();
  if (!term) return 0;
  return String(content || '').toUpperCase().split(term.toUpperCase()).length - 1;
};

const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizedInternalClaimNumbers = (storedValue, claimNumber, content) => {
  const highmark = String(claimNumber || '').trim();
  const candidates = String(storedValue || '').split(',').map(value => value.trim()).filter(Boolean);
  if (highmark) {
    const adjacentPattern = new RegExp(`${escapePattern(highmark)}([A-Za-z][A-Za-z0-9_-]{1,30})`, 'gi');
    let match;
    while ((match = adjacentPattern.exec(String(content || ''))) !== null) candidates.push(match[1]);
  }
  const normalized = [];
  candidates.forEach(candidate => {
    let value = String(candidate || '').trim();
    if (!value) return;
    if (highmark && value.toUpperCase().startsWith(highmark.toUpperCase())) value = value.slice(highmark.length).trim();
    const strict = value.match(/^([A-Za-z]{3}\d{3})(?=\d{4,}|$)/);
    if (strict) value = strict[1].toUpperCase();
    if (!value || value.toUpperCase() === highmark.toUpperCase() || /^\d{15,}$/.test(value)) return;
    if (!normalized.some(item => item.toUpperCase() === value.toUpperCase())) normalized.push(value);
  });
  return normalized;
};

function claimSliceUrl(source, claimNumber, internalNumber) {
  const base = source.claim_slice_url || String(source.download_url || '').replace(/\/download\/?(?:\?.*)?$/i, '/claim-slice/');
  const params = new URLSearchParams({ claim_number: claimNumber });
  if (internalNumber) params.set('internal_claim_number', internalNumber);
  return `${base}?${params.toString()}`;
}

export default function ClaimSourceViewer({ claimNumber, sources, onClose }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [content, setContent] = useState('');
  const [claimRows, setClaimRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const highmarkRefs = useRef([]);
  const searchRefs = useRef([]);
  const [highmarkIndex, setHighmarkIndex] = useState(0);
  const [fileSearch, setFileSearch] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [sliceBusy, setSliceBusy] = useState(false);
  const [sliceMessage, setSliceMessage] = useState('');
  const selected = sources[selectedIndex];
  const is837 = String(selected?.type || '').toUpperCase() === '837';

  useEffect(() => {
    if (!selected?.download_url) return undefined;
    let cancelled = false;
    setLoading(true); setError(''); setContent(''); setClaimRows([]);
    highmarkRefs.current = []; searchRefs.current = [];
    setHighmarkIndex(0); setFileSearch(''); setSearchIndex(0); setSliceMessage('');
    portalFetch(`${selected.download_url}?view=1`)
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load the archived file.');
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Unable to load the archived file.');
        return data;
      })
      .then(data => {
        if (!cancelled) {
          setContent(String(data.content || ''));
          setClaimRows(Array.isArray(data.claim_rows) ? data.claim_rows : []);
        }
      })
      .catch(reason => { if (!cancelled) setError(reason.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!loading && content && !fileSearch) highmarkRefs.current[highmarkIndex]?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [content, loading, selectedIndex, highmarkIndex, fileSearch]);

  useEffect(() => {
    if (!loading && content && fileSearch) searchRefs.current[searchIndex]?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [content, loading, selectedIndex, fileSearch, searchIndex]);

  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  if (!selected) return null;

  const internalNumbers = is837 ? [] : normalizedInternalClaimNumbers(selected.internal_claim_number, claimNumber, content);
  const displayedInternalNumber = internalNumbers.join(', ');
  const highmarkCount = countOccurrences(content, claimNumber);
  const internalCount = internalNumbers.reduce((total, number) => total + countOccurrences(content, number), 0);
  const searchTerm = fileSearch.trim();
  const searchCount = countOccurrences(content, searchTerm);
  const baseTerms = [claimNumber, ...internalNumbers].filter(Boolean).sort((left, right) => right.length - left.length);
  const terms = [searchTerm, ...baseTerms].filter((term, index, values) => term && values.findIndex(value => value.toUpperCase() === term.toUpperCase()) === index);
  const pattern = terms.length ? new RegExp(`(${terms.map(escapePattern).join('|')})`, 'gi') : null;
  const displayRows = (claimRows.length ? claimRows : viewerLines(content, selected.type))
    .flatMap(row => String(row || '').replace(/\r\n?/g, '\n').replace(/[~∼˜]/g, '\n').split('\n'))
    .map(row => row.trim()).filter(row => row.length);

  const moveHighmark = direction => {
    if (!highmarkCount) return;
    if (highmarkCount === 1) { highmarkRefs.current[0]?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); return; }
    setHighmarkIndex(current => (current + direction + highmarkCount) % highmarkCount);
  };
  const moveSearch = direction => {
    if (!searchCount) return;
    if (searchCount === 1) { searchRefs.current[0]?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); return; }
    setSearchIndex(current => (current + direction + searchCount) % searchCount);
  };

  const downloadClaimSlice = async () => {
    setSliceBusy(true); setSliceMessage('');
    try {
      const internalNumber = internalNumbers[0] || selected.internal_claim_number || '';
      const response = await portalFetch(claimSliceUrl(selected, claimNumber, internalNumber));
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to create the sliced claim file.');
      }
      await downloadBlobResponse(response, `claim_${claimNumber}.txt`);
    } catch (reason) {
      setSliceMessage(reason.message || 'Unable to create the sliced claim file.');
    } finally { setSliceBusy(false); }
  };

  let highmarkRenderIndex = 0;
  let searchRenderIndex = 0;
  const renderLine = (line, lineIndex) => {
    if (!pattern) return <div className="mpl-source-code-line" key={lineIndex}>{line || ' '}</div>;
    const parts = line.split(pattern);
    return <div className="mpl-source-code-line" key={lineIndex}>{parts.map((part, partIndex) => {
      const isMatch = terms.some(term => term.toUpperCase() === part.toUpperCase());
      if (!isMatch) return <React.Fragment key={partIndex}>{part}</React.Fragment>;
      const isSearchMatch = Boolean(searchTerm) && part.toUpperCase() === searchTerm.toUpperCase();
      if (isSearchMatch) {
        const occurrenceIndex = searchRenderIndex++;
        return <mark ref={node => { searchRefs.current[occurrenceIndex] = node; }} className={occurrenceIndex === searchIndex ? 'file-search active' : 'file-search'} key={partIndex}>{part}</mark>;
      }
      const isHighmark = part.toUpperCase() === String(claimNumber).toUpperCase();
      if (isHighmark) {
        const occurrenceIndex = highmarkRenderIndex++;
        return <mark ref={node => { highmarkRefs.current[occurrenceIndex] = node; }} className={occurrenceIndex === highmarkIndex ? 'claim active' : 'claim'} key={partIndex}>{part}</mark>;
      }
      return <mark className="internal" key={partIndex}>{part}</mark>;
    })}</div>;
  };

  return createPortal(<div className="mpl-file-viewer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="mpl-file-viewer" role="dialog" aria-modal="true" aria-labelledby="claim-source-viewer-title">
      <header>
        <div><span>MATCHED SOURCE EVIDENCE</span><h3 id="claim-source-viewer-title">{selected.type} file for Highmark claim {claimNumber}</h3></div>
        <button type="button" onClick={onClose} aria-label="Close file viewer">×</button>
      </header>
      <div className="mpl-file-viewer-toolbar">
        <label><span>FILE</span><select value={selectedIndex} onChange={event => setSelectedIndex(Number(event.target.value))}>{sources.map((source, index) => <option value={index} key={`${source.type}-${source.filename}-${index}`}>{source.filename}</option>)}</select></label>
        <dl>
          {!is837 && <div><dt>Internal claim number</dt><dd>{displayedInternalNumber || selected.internal_claim_number || 'Not found'}</dd></div>}
          <div><dt>File received</dt><dd>{dateLabel(selected.date)}</dd></div>
          <div><dt>Status</dt><dd>{statusLabel(selected.status)}</dd></div>
        </dl>
        <a className="mpl-btn primary" href={selected.download_url}>Download file</a>
        <button type="button" className="mpl-claim-slice-download" onClick={downloadClaimSlice} disabled={sliceBusy} aria-label="Download sliced claim file" title="Download sliced claim file"><DownloadIcon /></button>
        {sliceMessage && <span className="mpl-claim-slice-message" role="alert">{sliceMessage}</span>}
      </div>
      <div className="mpl-file-match-summary">
        <span><b>{highmarkCount}</b> Highmark claim occurrence{highmarkCount === 1 ? '' : 's'}</span>
        <div className="mpl-match-navigation" aria-label="Highmark claim match navigation"><button type="button" onClick={() => moveHighmark(-1)} disabled={!highmarkCount} aria-label="Previous Highmark claim occurrence" title="Previous match">↑</button><span>{highmarkCount ? highmarkIndex + 1 : 0} / {highmarkCount}</span><button type="button" onClick={() => moveHighmark(1)} disabled={!highmarkCount} aria-label="Next Highmark claim occurrence" title="Next match">↓</button></div>
        {!is837 && <span><b>{internalCount}</b> internal claim occurrence{internalCount === 1 ? '' : 's'}</span>}
        <small>{is837 ? 'Yellow = Highmark claim' : 'Yellow = Highmark claim · Blue = internal claim'}</small>
      </div>
      <div className={`mpl-file-content ${['835', 'MIR', 'RECON', '837'].includes(String(selected.type).toUpperCase()) ? 'one-claim-per-line' : ''}`}>
        <div className="mpl-file-content-heading"><strong>File content</strong><div className="mpl-file-search"><label><span className="sr-only">Search file content</span><input type="search" value={fileSearch} onChange={event => { setFileSearch(event.target.value); setSearchIndex(0); searchRefs.current = []; }} placeholder="Search file…" /></label><span>{searchTerm ? `${searchCount ? searchIndex + 1 : 0} / ${searchCount}` : '0 / 0'}</span><button type="button" onClick={() => moveSearch(-1)} disabled={!searchCount} aria-label="Previous search result" title="Previous search result">↑</button><button type="button" onClick={() => moveSearch(1)} disabled={!searchCount} aria-label="Next search result" title="Next search result">↓</button></div><small>{selected.filename}</small></div>
        {loading ? <p className="mpl-empty">Loading archived file…</p> : error ? <p className="mpl-file-view-error">{error}</p> : <div className="mpl-source-code" role="region" aria-label="Matched source file content">{displayRows.map(renderLine)}</div>}
      </div>
    </section>
  </div>, document.body);
}
