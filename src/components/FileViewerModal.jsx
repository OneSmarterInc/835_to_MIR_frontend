import React, { useEffect, useMemo, useRef, useState } from "react";
import { portalFetch } from "../utils/api";
import { encodeDemoFileContent } from "../utils/demoEncoder";
import "./FileViewerPage.css";

function findOccurrences(content, search) {
  const source = String(content || "");
  const term = String(search || "").trim();
  if (!term) return [];
  const haystack = source.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  const matches = [];
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    matches.push(index);
    from = index + Math.max(needle.length, 1);
  }
  return matches;
}

function format835ForViewer(content) {
  const source = String(content || "");
  if (!source) return source;
  return source
    .replace(/~\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export default function FileViewerModal({ fileId, onClose }) {
  const noDataMessage = "No data available in DataTable for this record.";
  const [loading, setLoading] = useState(true);
  const [filename, setFilename] = useState("Loading file...");
  const [ediText, setEdiText] = useState("");
  const [mirText, setMirText] = useState("");
  const [activeTab, setActiveTab] = useState("835");
  const [copyStatus, setCopyStatus] = useState("Copy");
  const [error, setError] = useState(null);
  const [loadedFileId, setLoadedFileId] = useState(null);
  const [fileSearch, setFileSearch] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const matchRefs = useRef([]);

  useEffect(() => {
    if (!fileId) {
      setLoadedFileId(null);
      setLoading(true);
      setError(null);
      setFileSearch("");
      setSearchIndex(0);
      matchRefs.current = [];
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setLoadedFileId(null);
    setError(null);
    setActiveTab("835");
    setFileSearch("");
    setSearchIndex(0);
    matchRefs.current = [];

    portalFetch(`/api/file-content/${fileId}/`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not retrieve file content");
        return data;
      })
      .then((data) => {
        setFilename(data.filename || "File Viewer");
        setEdiText(encodeDemoFileContent(format835ForViewer(data.edi_text || noDataMessage), "835"));
        setMirText(encodeDemoFileContent(data.mir_text || noDataMessage, "MIR"));
        setLoadedFileId(fileId);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setFilename("Error Loading File");
        setLoadedFileId(fileId);
        setLoading(false);
      });

    return () => controller.abort();
  }, [fileId]);

  const currentText = activeTab === "835" ? ediText : mirText;
  const isCurrentFileLoading = Boolean(fileId) && (loading || loadedFileId !== fileId);
  const displayText = isCurrentFileLoading
    ? "Loading file content..."
    : error
      ? `Error: ${error}`
      : currentText;

  const occurrences = useMemo(
    () => findOccurrences(displayText, fileSearch),
    [displayText, fileSearch],
  );

  useEffect(() => {
    setSearchIndex(0);
    matchRefs.current = [];
  }, [fileSearch, activeTab, displayText]);

  useEffect(() => {
    const term = fileSearch.trim();
    if (!term || !occurrences.length) return undefined;
    const boundedIndex = Math.min(searchIndex, occurrences.length - 1);
    if (boundedIndex !== searchIndex) {
      setSearchIndex(boundedIndex);
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      matchRefs.current[boundedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fileSearch, occurrences.length, searchIndex]);

  const renderedPreview = useMemo(() => {
    const term = fileSearch.trim();
    if (!term || !displayText) return displayText;

    const lowerText = displayText.toLocaleLowerCase();
    const lowerTerm = term.toLocaleLowerCase();
    const parts = [];
    let cursor = 0;
    let occurrenceIndex = 0;

    while (cursor < displayText.length) {
      const index = lowerText.indexOf(lowerTerm, cursor);
      if (index < 0) {
        parts.push(displayText.slice(cursor));
        break;
      }

      if (index > cursor) parts.push(displayText.slice(cursor, index));
      const currentOccurrence = occurrenceIndex;
      const end = index + term.length;
      parts.push(
        <mark
          key={`${index}-${currentOccurrence}`}
          ref={(node) => { matchRefs.current[currentOccurrence] = node; }}
          className={currentOccurrence === searchIndex ? "file-search active" : "file-search"}
        >
          {displayText.slice(index, end)}
        </mark>,
      );
      occurrenceIndex += 1;
      cursor = end;
    }

    return parts;
  }, [displayText, fileSearch, searchIndex]);

  // This component stays mounted in both the client and admin shells. Keep all
  // hooks above the null-file return so clicking an eye button cannot change
  // the React hook order (null -> file id) and abort the viewer render.
  if (!fileId) return null;

  const handleCopy = () => {
    if (!currentText) return;
    navigator.clipboard.writeText(currentText).then(() => {
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus("Copy"), 2000);
    });
  };

  const jumpToSearch = (direction) => {
    if (!occurrences.length) return;
    setSearchIndex((current) => (current + direction + occurrences.length) % occurrences.length);
  };

  const selectTab = (tab) => {
    setActiveTab(tab);
    setFileSearch("");
    setSearchIndex(0);
    matchRefs.current = [];
  };

  return (
    <section className="file-viewer-page-shell" aria-labelledby="file-viewer-page-title">
      <header className="file-viewer-page-header">
        <div className="file-viewer-page-title">
          <div className="file-viewer-page-eyebrow">File viewer</div>
          <h2 id="file-viewer-page-title">{filename}</h2>
        </div>
        <button type="button" className="file-viewer-back" onClick={onClose}>← Back</button>
      </header>

      <div className="file-viewer-page-toolbar">
        <div className="file-viewer-page-tabs">
          <button type="button" className={`tab-btn ${activeTab === "835" ? "active" : ""}`} onClick={() => selectTab("835")}>835 Code</button>
          <button type="button" className={`tab-btn ${activeTab === "MIR" ? "active" : ""}`} onClick={() => selectTab("MIR")}>MIR Code</button>
        </div>
        <div className="file-viewer-page-search">
          <label>
            <span className="sr-only">Search file content</span>
            <input type="search" value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder="Search file…" />
          </label>
          <button type="button" onClick={() => jumpToSearch(-1)} disabled={!occurrences.length} aria-label="Previous search result" title="Previous match">↑</button>
          <span className="match-count">{fileSearch.trim() ? `${occurrences.length ? searchIndex + 1 : 0} / ${occurrences.length}` : "0 / 0"}</span>
          <button type="button" onClick={() => jumpToSearch(1)} disabled={!occurrences.length} aria-label="Next search result" title="Next match">↓</button>
        </div>
      </div>

      <div className="file-viewer-page-body">
        <pre className="file-viewer-page-preview">{renderedPreview}</pre>
      </div>

      <footer className="file-viewer-page-footer">
        <span className="file-viewer-page-note">Gray = search match · dark = current match. Use ↑ / ↓ to jump directly to each occurrence.</span>
        <div className="file-viewer-page-footer-actions">
          <button type="button" className="btn secondary" onClick={handleCopy}>{copyStatus}</button>
          <button type="button" className="btn primary" onClick={onClose}>Back</button>
        </div>
      </footer>
    </section>
  );
}
