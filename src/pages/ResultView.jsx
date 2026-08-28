import React, { useCallback, useEffect, useRef, useState } from "react";
import "./ResultView.css";

function authHeaders(extra = {}) {
  const token = localStorage.getItem("onesmarter_admin_token");
  return token ? { ...extra, Authorization: `Token ${token}` } : extra;
}
async function apiJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", ...options, headers: authHeaders(options.headers || {}) });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    await response.text();
    throw new Error(response.status >= 500
      ? `Results service is temporarily unavailable (${response.status}). Please retry.`
      : `Server returned an invalid response (${response.status}).`);
  }
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
const money = (value) => Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const showDate = (value) => value ? new Date(value).toLocaleString() : "—";
const label = (value) => ({ NOT_IN_MIR: "Not in MIR", NOT_IN_RECON: "Not in RECON", SIGNATURE_MISMATCH: "Signature mismatch", CLEAR: "Clear", PARTIALLY_PAID: "Partially paid", OVERPAID: "Overpaid", UNPAID: "Unpaid", AMOUNT_MISMATCH: "Amount mismatch" }[value] || value);
const tone = (value) => value === "CLEAR" ? "ok" : ["NOT_IN_MIR", "NOT_IN_RECON", "UNPAID"].includes(value) ? "idle" : "bad";

export default function ResultView({ clients = [], isAdmin = false, initialClientId = "" }) {
  const [clientId, setClientId] = useState(initialClientId || "");
  const [selectedFile, setSelectedFile] = useState(null);
  const [data, setData] = useState({ claims: [], recon_files: [] });
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [filesBusy, setFilesBusy] = useState(false);
  const [matchHistory, setMatchHistory] = useState(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "", direction: "asc" });
  const requestSequence = useRef(0);

  useEffect(() => { if (initialClientId) setClientId(initialClientId); }, [initialClientId]);
  const loadResults = useCallback(async (requestedPage = 1, requestedSearch = "", requestedSort = { key: "", direction: "asc" }) => {
    const sequence = ++requestSequence.current;
    try {
      const params = new URLSearchParams();
      if (isAdmin && clientId) params.set("client_id", clientId);
      if (isAdmin && !clientId) params.set("scope", "global");
      if (requestedSearch) params.set("search", requestedSearch);
      if (requestedSort.key) {
        params.set("sort_by", requestedSort.key);
        params.set("sort_direction", requestedSort.direction);
      }
      params.set("page", String(requestedPage));
      params.set("page_size", "100");
      const result = await apiJson(`/edi835/api/reconciliation/?${params}`);
      if (sequence !== requestSequence.current) return;
      setData(result);
      setPage(result.page || requestedPage);
    } catch (error) { if (sequence === requestSequence.current) setMessage({ kind: "error", text: error.message }); }
  }, [clientId, isAdmin]);
  useEffect(() => { setPage(1); setSearch(""); setActiveSearch(""); }, [loadResults]);
  useEffect(() => {
    const value = search.trim();
    const timer = window.setTimeout(() => {
      setActiveSearch(value);
      setPage(1);
      loadResults(1, value, sort);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, sort, loadResults]);

  const waitForProcessing = async (fileId) => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const result = await apiJson(`/edi835/api/recon/files/${fileId}/`);
      if (result.file.status === "PROCESSED") return result.file;
      if (result.file.status === "FAILED") throw new Error(result.file.processing_error || "RECON processing failed.");
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    throw new Error("RECON processing is still running. Refresh Results in a few moments.");
  };

  const uploadAndProcess = async () => {
    if (!selectedFile) return setMessage({ kind: "error", text: "Select a RECON file first." });
    setBusy(true); setMessage(null);
    try {
      const form = new FormData(); form.append("recon_file", selectedFile); if (isAdmin) form.append("client_id", clientId);
      const uploaded = await apiJson("/edi835/api/recon/upload/", { method: "POST", body: form });
      await apiJson(`/edi835/api/recon/files/${uploaded.file.id}/process/`, { method: "POST" });
      setMessage({ kind: "success", text: "RECON uploaded. Processing safely in the background…" });
      const processed = await waitForProcessing(uploaded.file.id);
      setSelectedFile(null); const input = document.getElementById("recon-file-input"); if (input) input.value = "";
      setMessage({ kind: "success", text: `Processed ${processed.claim_count} claims. MIR results have been updated.` });
      setSearch(""); setActiveSearch(""); await loadResults(1, "", sort);
    } catch (error) { setMessage({ kind: "error", text: error.message }); } finally { setBusy(false); }
  };
  const openClaim = async (row) => {
    try {
      setDetail(await apiJson(`/edi835/api/reconciliation/claims/${row.mir_claim_id}/`));
    } catch (error) { setMessage({ kind: "error", text: error.message }); }
  };
  const openUploadedFiles = async () => {
    setFilesOpen(true);
    setFilesBusy(true);
    try {
      const params = new URLSearchParams();
      if (isAdmin && clientId) params.set("client_id", clientId);
      if (isAdmin && !clientId) params.set("scope", "global");
      const result = await apiJson(`/edi835/api/recon/files/?${params}`);
      setUploadedFiles(result.files || []);
    } catch (error) {
      setMessage({ kind: "error", text: error.message });
      setFilesOpen(false);
    } finally { setFilesBusy(false); }
  };
  const downloadRecon = async (file) => {
    try {
      const response = await fetch(`/edi835/api/recon/files/${file.id}/download/`, {
        credentials: "include",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.original_filename || "recon-file";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) { setMessage({ kind: "error", text: error.message }); }
  };
  const rows = data.claims;
  const changeSort = (key) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
  }));
  const sortArrow = (key) => sort.key === key ? (sort.direction === "asc" ? "▲" : "▼") : "⇅";

  return <section className="view on result-view">
    <div className="eyebrow">Operations Studio</div><h1>Result</h1>
    <p className="sub">Compare every MIR claim with all processed RECON payment files.</p>
    <div className="start-conversion-card result-process-card">
      {isAdmin && <div className="result-client-bar"><label>Associate with Client:</label><select value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">-- None (Global System Default) --</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.client_code || c.code || "—"})</option>)}</select></div>}
      <div className="start-conversion-header"><h2>Upload RECON</h2><div className="step-pills"><span className="step-pill active">1 · UPLOAD</span><span className="step-arrow">→</span><span className="step-pill">2 · PROCESS</span><span className="step-arrow">→</span><span className="step-pill">3 · RECONCILE</span></div></div>
      <div className="conversion-boxes result-conversion-boxes"><div className="c-box"><div className="c-box-label">RECON INPUT</div><input id="recon-file-input" type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} /><div className="subtext">{selectedFile ? selectedFile.name : "Any RECON filename or extension, including .p7a"}</div></div><div className="c-actions result-c-actions"><button className="btn-gray" onClick={uploadAndProcess} disabled={busy}>{busy ? "Processing…" : "Process RECON"}</button><button className="btn-gray" onClick={() => loadResults(page, activeSearch, sort)} disabled={busy}>Refresh</button></div></div>
      {message && <div className={`result-message ${message.kind}`}>{message.text}</div>}
    </div>
    <div className="filters-bar result-filters"><div className="result-global-search"><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all MIR and RECON data" aria-label="Search all MIR and RECON results" /></div><button type="button" className="btn-gray result-files-button" onClick={openUploadedFiles}>Uploaded RECON files</button><span className="runs-counter">{data.total_claims ?? rows.length} reconciliation claims · all processed RECON files</span></div>
    <div className="card result-table-card"><div className="result-table-wrap"><table className="reconciliation-table"><colgroup><col className="result-col-claim" /><col className="result-col-patient" /><col className="result-col-file" /><col className="result-col-file" /><col className="result-col-money" /><col className="result-col-money" /><col className="result-col-difference" /><col className="result-col-status" /></colgroup><thead><tr><SortableHeader label="Claim ID" sortKey="claim_id" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="Patient name" sortKey="patient_name" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="MIR file / date" sortKey="mir_filename" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="RECON file / date" sortKey="recon_filename" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="Amount in MIR" sortKey="amount_to_pay" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="Amount in RECON" sortKey="recon_paid_amount" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="Difference" sortKey="difference_amount" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="Status" sortKey="status" sort={sort} onSort={changeSort} arrow={sortArrow} /></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.mir_claim_id || `recon-${row.claim_id}`}><td><b>{row.claim_id || "—"}</b></td><td>{row.mir_claim_id ? <button className="result-name-link" onClick={() => openClaim(row)}>{row.patient_name || "View claim"}</button> : <span>RECON-only claim</span>}<small>{row.member_id || "—"}</small></td><td>{row.mir_filename || "—"}{row.mir_date && <small>{showDate(row.mir_date)}</small>}</td><td><ReconMatches row={row} onShowMore={() => setMatchHistory(row)} /></td><td className="num">{money(row.amount_to_pay)}</td><td className="num">{money(row.recon_paid_amount)}</td><td className="num">{money(row.difference_amount)}</td><td><span className={`tag ${tone(row.status)}`}>{label(row.status)}</span></td></tr>) : <tr><td colSpan="8" className="result-empty">No MIR or RECON claims match this search.</td></tr>}</tbody></table></div><div className="result-pagination"><button className="btn-gray" disabled={page <= 1 || busy} onClick={() => loadResults(page - 1, activeSearch, sort)}>Previous</button><span>Page {page} of {data.total_pages || 1}</span><button className="btn-gray" disabled={page >= (data.total_pages || 1) || busy} onClick={() => loadResults(page + 1, activeSearch, sort)}>Next</button></div></div>
    {detail && <div className="result-detail-backdrop" onClick={() => setDetail(null)}><div className="result-detail" onClick={(e) => e.stopPropagation()}><div className="result-detail-title"><div><div className="eyebrow">Claim reconciliation</div><h2>{detail.summary?.claim_id}</h2></div><button className="btn" onClick={() => setDetail(null)}>Close</button></div><div className="claim-summary-grid"><div><b>Patient</b><span>{detail.summary?.patient_name || "—"}</span></div><div><b>MIR / RECON services</b><span>{detail.summary?.mir_service_count} / {detail.summary?.recon_service_count}</span></div><div><b>Amount to pay</b><span>{money(detail.summary?.amount_to_pay)}</span></div><div><b>Paid / remaining</b><span>{money(detail.summary?.recon_paid_amount)} / {money(detail.summary?.remaining_amount)}</span></div></div><h3>MIR services · {detail.mir.file}</h3><ServiceTable services={detail.mir.services} /><h3>RECON services · {detail.recon.file || "Not in RECON"}</h3><ServiceTable services={detail.recon.services} /></div></div>}
    {filesOpen && <div className="result-detail-backdrop" onClick={() => setFilesOpen(false)}><div className="result-detail result-files-modal" role="dialog" aria-modal="true" aria-labelledby="uploaded-recon-title" onClick={(e) => e.stopPropagation()}><div className="result-detail-title"><div><div className="eyebrow">RECON archive</div><h2 id="uploaded-recon-title">Uploaded RECON files</h2></div><button className="btn" onClick={() => setFilesOpen(false)}>Close</button></div>{filesBusy ? <div className="result-empty">Loading uploaded files…</div> : uploadedFiles.length ? <div className="result-files-list">{uploadedFiles.map((file) => <div className="result-file-row" key={file.id}><div><b>{file.original_filename}</b><small>{showDate(file.uploaded_at)} · {file.status} · {Number(file.claim_count || 0).toLocaleString()} {Number(file.claim_count || 0) === 1 ? "claim" : "claims"} · {Number(file.file_size || 0).toLocaleString()} bytes</small></div><button type="button" className="btn-gray" onClick={() => downloadRecon(file)}>Download</button></div>)}</div> : <div className="result-empty">No RECON files have been uploaded in this scope.</div>}</div></div>}
    {matchHistory && <div className="result-detail-backdrop" onClick={() => setMatchHistory(null)}><div className="result-detail result-files-modal" role="dialog" aria-modal="true" aria-labelledby="recon-history-title" onClick={(e) => e.stopPropagation()}><div className="result-detail-title"><div><div className="eyebrow">Claim RECON history</div><h2 id="recon-history-title">{matchHistory.claim_id}</h2></div><button className="btn" onClick={() => setMatchHistory(null)}>Close</button></div><div className="result-files-list">{(matchHistory.recon_matches || []).map((match) => <div className="result-file-row" key={`${match.recon_claim_id}-${match.filename}`}><div><b>{match.filename}</b><small>{showDate(match.date)} · {match.service_count} {match.service_count === 1 ? "service" : "services"}</small></div><div className="result-match-amount"><small>Amount in this RECON</small><b>{money(match.paid_amount)}</b></div></div>)}</div><div className="result-match-total"><span>Total across all matching RECON files</span><b>{money(matchHistory.recon_paid_amount)}</b></div></div></div>}
  </section>;
}

function SortableHeader({ label: headerLabel, sortKey, sort, onSort, arrow }) {
  const active = sort.key === sortKey;
  return <th aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}><button type="button" className={`result-sort-button${active ? " active" : ""}`} onClick={() => onSort(sortKey)}><span>{headerLabel}</span><span className="result-sort-arrow" aria-hidden="true">{arrow(sortKey)}</span></button></th>;
}

function ReconMatches({ row, onShowMore }) {
  const matches = row.recon_matches || [];
  if (!matches.length) return "—";
  return <div className="result-recon-matches">{matches.slice(0, 3).map((match) => <div className="result-recon-match" key={`${match.recon_claim_id}-${match.filename}`}><span>{match.filename}</span><small>{showDate(match.date)} · {money(match.paid_amount)}</small></div>)}{matches.length > 3 && <button type="button" className="result-show-more" onClick={onShowMore}>Show {matches.length - 3} more</button>}</div>;
}

function ServiceTable({ services = [] }) {
  return <div className="result-table-wrap"><table><thead><tr><th>#</th><th>Procedure</th><th>Date</th><th>Units</th><th>Charge</th><th>Allowed</th><th>Paid</th><th>Reason</th></tr></thead><tbody>{services.length ? services.map((s) => <tr key={s.sequence}><td>{s.sequence}</td><td>{s.procedure_code || s.revenue_code || "—"}</td><td>{s.service_date || s.service_from_date || "—"}</td><td>{s.units}</td><td>{money(s.charge_amount)}</td><td>{s.allowed_amount == null ? "—" : money(s.allowed_amount)}</td><td>{money(s.paid_amount)}</td><td>{s.reason_code || "—"}</td></tr>) : <tr><td colSpan="8" className="result-empty">No service rows.</td></tr>}</tbody></table></div>;
}
