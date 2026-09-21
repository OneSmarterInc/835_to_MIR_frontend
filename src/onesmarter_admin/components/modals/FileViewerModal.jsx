import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../../../components/FileViewerPage.css';

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default function FileViewerModal({ isOpen, onClose, fileData, stepTitle, stepNum }) {
  const [textContent, setTextContent] = useState('');
  const [loadingText, setLoadingText] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const searchRefs = useRef([]);

  const isPdf = fileData?.contentType?.includes('pdf') || fileData?.filename?.toLowerCase().endsWith('.pdf');
  const isImage = fileData?.contentType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp|svg|tiff|tif|ico|avif|heic)$/i.test(fileData?.filename || '');
  const isText = !isPdf && !isImage && fileData?.blob;

  useEffect(() => {
    if (isText && fileData?.blob) {
      setLoadingText(true);
      fileData.blob.text()
        .then((text) => setTextContent(text))
        .catch(() => setTextContent('(Unable to display text content)'))
        .finally(() => setLoadingText(false));
    } else {
      setTextContent('');
    }
    setFileSearch('');
    setSearchIndex(0);
    searchRefs.current = [];
  }, [fileData, isText]);

  const searchTerm = fileSearch.trim();
  const matches = useMemo(() => {
    if (!searchTerm || !textContent) return [];
    const positions = [];
    const source = textContent.toLocaleLowerCase();
    const needle = searchTerm.toLocaleLowerCase();
    let from = 0;
    while (from <= source.length - needle.length) {
      const index = source.indexOf(needle, from);
      if (index < 0) break;
      positions.push(index);
      from = index + Math.max(needle.length, 1);
    }
    return positions;
  }, [searchTerm, textContent]);

  useEffect(() => {
    setSearchIndex(0);
    searchRefs.current = [];
  }, [searchTerm]);

  if (!isOpen || !fileData) return null;

  const moveSearch = (direction) => {
    if (!matches.length) return;
    const next = (searchIndex + direction + matches.length) % matches.length;
    setSearchIndex(next);
    window.requestAnimationFrame(() => {
      searchRefs.current[next]?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
  };

  let renderedMatch = 0;
  const renderText = () => {
    if (!searchTerm) return textContent || '(Empty file)';
    const pattern = new RegExp(`(${escapePattern(searchTerm)})`, 'gi');
    return String(textContent || '').split(pattern).map((part, index) => {
      if (part.toLocaleLowerCase() !== searchTerm.toLocaleLowerCase()) return <React.Fragment key={index}>{part}</React.Fragment>;
      const occurrence = renderedMatch++;
      return <mark ref={(node) => { searchRefs.current[occurrence] = node; }} className={`file-search${occurrence === searchIndex ? ' active' : ''}`} key={index}>{part}</mark>;
    });
  };

  const handleDownload = () => {
    if (!fileData.fileUrl) return;
    const anchor = document.createElement('a');
    anchor.href = fileData.fileUrl;
    anchor.download = fileData.filename || 'evidence_file';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => anchor.remove(), 1000);
  };

  const handleOpenNewTab = () => {
    if (fileData.fileUrl) window.open(fileData.fileUrl, '_blank');
  };

  return (
    <section className="file-viewer-page-shell" aria-labelledby="admin-file-viewer-title">
      <header className="file-viewer-page-header">
        <div className="file-viewer-page-title">
          <div className="file-viewer-page-eyebrow">Uploaded evidence preview{stepNum ? ` · Step ${stepNum}` : ''}</div>
          <h2 id="admin-file-viewer-title">{fileData.filename}</h2>
          {stepTitle && <div className="file-viewer-page-note" style={{ color: '#b7c7d8', marginTop: '4px' }}>{stepTitle}</div>}
        </div>
        <button type="button" className="file-viewer-back" onClick={onClose}>← Back</button>
      </header>

      <div className="file-viewer-page-toolbar">
        <span className="file-viewer-page-note">{fileData.contentType || 'file'}</span>
        {isText && <div className="file-viewer-page-search">
          <label>
            <span className="sr-only">Search file content</span>
            <input type="search" value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder="Search file…" />
          </label>
          <button type="button" onClick={() => moveSearch(-1)} disabled={!matches.length} aria-label="Previous search result" title="Previous match">↑</button>
          <span className="match-count">{searchTerm ? `${matches.length ? searchIndex + 1 : 0} / ${matches.length}` : '0 / 0'}</span>
          <button type="button" onClick={() => moveSearch(1)} disabled={!matches.length} aria-label="Next search result" title="Next match">↓</button>
        </div>}
      </div>

      <div className="file-viewer-page-body">
        {isPdf ? (
          <div className="file-viewer-page-media">
            <object data={fileData.fileUrl} type="application/pdf"><iframe src={fileData.fileUrl} title={fileData.filename} /></object>
          </div>
        ) : isImage ? (
          <div className="file-viewer-page-media"><img src={fileData.fileUrl} alt={fileData.filename} /></div>
        ) : isText ? (
          <pre className="file-viewer-page-preview">{loadingText ? 'Loading text contents...' : renderText()}</pre>
        ) : (
          <div className="file-viewer-page-media"><div style={{ textAlign: 'center', padding: '30px' }}><div style={{ fontSize: '32px' }}>📄</div><p>Binary file preview is not available in-browser.</p></div></div>
        )}
      </div>

      <footer className="file-viewer-page-footer">
        <span className="file-viewer-page-note">Search uses the same up/down navigation on the admin and client views.</span>
        <div className="file-viewer-page-footer-actions">
          <button type="button" className="btn tiny" onClick={handleOpenNewTab}>↗ Open in New Tab</button>
          <button type="button" className="btn tiny" onClick={handleDownload}>⬇ Download</button>
          <button type="button" className="btn tiny primary" onClick={onClose}>Back</button>
        </div>
      </footer>
    </section>
  );
}
