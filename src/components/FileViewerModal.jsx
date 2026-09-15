import React, { useEffect, useMemo, useRef, useState } from "react";
import { portalFetch } from "../utils/api";
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
  const editorRef = useRef(null);

  useEffect(() => {
    if (!fileId) {
      setLoadedFileId(null);
      setLoading(true);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setLoadedFileId(null);
    setError(null);
    setActiveTab("835");
    setFileSearch("");
    setSearchIndex(0);

    portalFetch(`/api/file-content/${fileId}/`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not retrieve file content");
        return data;
      })
      .then((data) => {
        setFilename(data.filename || "File View & Edit");
        setEdiText(data.edi_text || noDataMessage);
        setMirText(data.mir_text || noDataMessage);
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

  if (!fileId) return null;

  const currentText = activeTab === "835" ? ediText : mirText;
  const isCurrentFileLoading = loading || loadedFileId !== fileId;
  const occurrences = useMemo(() => findOccurrences(currentText, fileSearch), [currentText, fileSearch]);

  useEffect(() => {
    setSearchIndex(0);
  }, [fileSearch, activeTab]);

  const handleTextChange = (event) => {
    const value = event.target.value;
    if (activeTab === "835") setEdiText(value);
    else setMirText(value);
  };

  const handleCopy = () => {
    if (!currentText) return;
    navigator.clipboard.writeText(currentText).then(() => {
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus("Copy"), 2000);
    });
  };

  const jumpToSearch = (direction) => {
    if (!occurrences.length || !editorRef.current) return;
    const next = (searchIndex + direction + occurrences.length) % occurrences.length;
    setSearchIndex(next);
    const start = occurrences[next];
    const end = start + fileSearch.trim().length;
    const editor = editorRef.current;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(start, end);
    const before = currentText.slice(0, start);
    const line = before.split("\n").length - 1;
    const lineHeight = parseFloat(window.getComputedStyle(editor).lineHeight) || 18;
    editor.scrollTop = Math.max(0, line * lineHeight - editor.clientHeight / 2);
  };

  const selectTab = (tab) => {
    setActiveTab(tab);
    setFileSearch("");
    setSearchIndex(0);
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
        <textarea
          ref={editorRef}
          className="file-viewer-page-editor"
          spellCheck="false"
          value={isCurrentFileLoading ? "Loading file content..." : error ? `Error: ${error}` : currentText}
          onChange={handleTextChange}
          style={{ whiteSpace: activeTab === "835" ? "pre-wrap" : "pre", overflowX: activeTab === "835" ? "hidden" : "auto" }}
        />
      </div>

      <footer className="file-viewer-page-footer">
        <span className="file-viewer-page-note">Search arrows jump directly to the selected occurrence without changing file spacing.</span>
        <div className="file-viewer-page-footer-actions">
          <button type="button" className="btn secondary" onClick={handleCopy}>{copyStatus}</button>
          <button type="button" className="btn primary" onClick={onClose}>Back</button>
        </div>
      </footer>
    </section>
  );
}
