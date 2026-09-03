import React, { useCallback, useEffect, useRef, useState } from "react";
import { portalFetch } from "../utils/api";
import "./ResultView.css";
import TimeDisplay from "../components/TimeDisplay";
import ClientSelectDropdown from "../onesmarter_admin/components/ClientSelectDropdown";
import { showAppAlert } from "../components/AppDialog";
import { fileAccept, validateFileExtensions } from "../utils/fileTypes";
import OffboardedClientBanner from "../onesmarter_admin/components/OffboardedClientBanner";
import ReconciliationModal from "../components/ReconciliationModal";

function authHeaders(extra = {}) {
  const token = localStorage.getItem("onesmarter_admin_token");
  return token ? { ...extra, Authorization: `Token ${token}` } : extra;
}
async function apiJson(url, options = {}) {
  const response = await portalFetch(url, { ...options, headers: authHeaders(options.headers || {}) });
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
const hasMirAndRecon = (row) => Boolean(row?.mir_claim_id && (row?.recon_filename || row?.recon_matches?.length));
const showDate = (value) => <TimeDisplay value={value} easternOnly />;
const label = (value) => ({ NOT_IN_MIR: "Not in MIR", NOT_IN_RECON: "Not in RECON", SIGNATURE_MISMATCH: "Signature mismatch", CLEAR: "Clear", PARTIALLY_PAID: "Partially paid", OVERPAID: "Overpaid", UNPAID: "Unpaid", AMOUNT_MISMATCH: "Amount mismatch" }[value] || value);
const tone = (value) => value === "CLEAR" ? "ok" : ["NOT_IN_MIR", "NOT_IN_RECON", "UNPAID"].includes(value) ? "idle" : "bad";
const STATUS_OPTIONS = ["CLEAR", "NOT_IN_MIR", "NOT_IN_RECON", "SIGNATURE_MISMATCH", "PARTIALLY_PAID", "OVERPAID", "UNPAID", "AMOUNT_MISMATCH"];

function ExcelSheetIcon() {
  return <svg className="result-excel-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 2.75h10.2L19 6.55v14.7H5z" />
    <path d="M15 2.75v4h4M8 10.2l4 6.1m0-6.1-4 6.1M14.5 10.25h2M14.5 13.25h2M14.5 16.25h2" />
  </svg>;
}

export default function ResultView({ clients = [], isAdmin = false, initialClientId = "", selectedClient }) {
  const [clientId, setClientId] = useState(initialClientId || "");
  const currentAdminClient = clients.find((item) => String(item.id) === String(clientId)) || selectedClient;
  const isOffboarded = isAdmin && String(currentAdminClient?.stage || '').toLowerCase() === 'offboarded';
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
  const [exportBusy, setExportBusy] = useState(false);
  const [matchHistory, setMatchHistory] = useState(null);
  const [heldReview, setHeldReview] = useState(null);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState({ key: "", direction: "asc" });
  const [statusFilter, setStatusFilter] = useState("");
  const requestSequence = useRef(0);
  const requestAbort = useRef(null);
  const sortRef = useRef(sort);
  const statusFilterRef = useRef(statusFilter);

  useEffect(() => { if (initialClientId) setClientId(initialClientId); }, [initialClientId]);
  const loadResults = useCallback(async (requestedPage = 1, requestedSearch = "", requestedSort = { key: "", direction: "asc" }, requestedStatus = "", requestedPageSize = pageSize) => {
    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    const sequence = ++requestSequence.current;
    try {
      const params = new URLSearchParams();
      if (isAdmin && clientId) params.set("client_id", clientId);
      if (isAdmin && !clientId) params.set("scope", "global");
      if (requestedSearch) params.set("search", requestedSearch);
      if (requestedStatus) params.set("status", requestedStatus);
      if (requestedSort.key) {
        params.set("sort_by", requestedSort.key);
        params.set("sort_direction", requestedSort.direction);
      }
      params.set("page", String(requestedPage));
      params.set("page_size", String(requestedPageSize));
      const result = await apiJson(`/edi835/api/reconciliation/?${params}`, { signal: controller.signal });
      if (sequence !== requestSequence.current) return;
      setData(result);
      setPage(result.page || requestedPage);
    } catch (error) {
      if (error.name !== "AbortError" && sequence === requestSequence.current) {
        setMessage({ kind: "error", text: error.message });
      }
    }
  }, [clientId, isAdmin, pageSize]);
  useEffect(() => () => requestAbort.current?.abort(), []);
  useEffect(() => { setPage(1); setSearch(""); setActiveSearch(""); }, [loadResults]);
  useEffect(() => {
    const value = search.trim();
    const timer = window.setTimeout(() => {
      setActiveSearch(value);
      setPage(1);
      loadResults(1, value, sortRef.current, statusFilterRef.current);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, loadResults]);

  const waitForProcessing = async (fileId) => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const result = await apiJson(`/edi835/api/recon/files/${fileId}/`);
      if (["PROCESSED", "PARTIAL"].includes(result.file.status)) return result.file;
      if (result.file.status === "FAILED") throw new Error(result.file.processing_error || "RECON processing failed.");
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    throw new Error("RECON processing is still running. Refresh Results in a few moments.");
  };

  const uploadAndProcess = async () => {
    if (isOffboarded) return;
    if (!selectedFile) return setMessage({ kind: "error", text: "Select a RECON file first." });
    setBusy(true); setMessage(null);
    try {
      const form = new FormData(); form.append("recon_file", selectedFile); if (isAdmin) form.append("client_id", clientId);
      const uploaded = await apiJson("/edi835/api/recon/upload/", { method: "POST", body: form });
      await apiJson(`/edi835/api/recon/files/${uploaded.file.id}/process/`, { method: "POST" });
      setMessage({ kind: "success", text: "RECON uploaded. Processing safely in the background…" });
      const processed = await waitForProcessing(uploaded.file.id);
      setSelectedFile(null); const input = document.getElementById("recon-file-input"); if (input) input.value = "";
      const held = Number(processed.held_record_count || 0);
      setMessage({
        kind: held ? "warning" : "success",
        text: held
          ? `Processed ${processed.claim_count} claims; ${held} record(s) were held for review. MIR results have been updated.`
          : `Processed ${processed.claim_count} claims. MIR results have been updated.`,
      });
      if (held) {
        const review = await apiJson(`/edi835/api/recon/files/${uploaded.file.id}/`);
        setHeldReview({ file: review.file, errors: review.errors || [] });
      }
      setSearch(""); setActiveSearch(""); await loadResults(1, "", sort, statusFilter);
    } catch (error) { setMessage({ kind: "error", text: error.message }); } finally { setBusy(false); }
  };
  const handleReconFileChange = async (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return setSelectedFile(null);
    const extensionError = validateFileExtensions([file], "RECON");
    if (extensionError) {
      event.target.value = "";
      setSelectedFile(null);
      setMessage({ kind: "error", text: extensionError });
      await showAppAlert(extensionError, { title: "Wrong File Format", tone: "error" });
      return;
    }
    setSelectedFile(file);
    setMessage(null);
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
  const downloadFilteredResults = async () => {
    setExportBusy(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (isAdmin && clientId) params.set("client_id", clientId);
      if (isAdmin && !clientId) params.set("scope", "global");
      if (activeSearch) params.set("search", activeSearch);
      if (statusFilter) params.set("status", statusFilter);
      if (sort.key) {
        params.set("sort_by", sort.key);
        params.set("sort_direction", sort.direction);
      }
      const response = await portalFetch(`/edi835/api/reconciliation/export/?${params}`, {
        credentials: "include",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Excel download failed (${response.status}).`);
      }
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "onesmarter-reconciliation.xlsx";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage({ kind: "error", text: error.message });
    } finally {
      setExportBusy(false);
    }
  };
  const downloadRecon = async (file) => {
    try {
      const response = await portalFetch(`/edi835/api/recon/files/${file.id}/download/`, {
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
  const changeSort = (key) => {
    const current = sortRef.current;
    const next = {
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    };
    sortRef.current = next;
    setSort(next);
    setPage(1);
    loadResults(1, activeSearch, next, statusFilterRef.current);
  };
  const changeStatusFilter = (value) => {
    statusFilterRef.current = value;
    setStatusFilter(value);
    setPage(1);
    loadResults(1, activeSearch, sortRef.current, value);
  };
  const sortArrow = (key) => sort.key === key ? (sort.direction === "asc" ? "▲" : "▼") : "⇅";

  return <section className="view on result-view table-screen">
    <h1>Reconciliation</h1>
    <p className="sub">Compare every MIR claim with all processed RECON payment files.</p>
    <OffboardedClientBanner client={currentAdminClient} detail="Existing reconciliation results remain available for review. New RECON uploads and processing are locked." />
    <div className="result-upload-panel">
      <div className={`result-upload-row ${isAdmin ? "with-client" : ""}`}>
        {isAdmin && <div className="result-compact-client"><label>Client</label><ClientSelectDropdown clients={clients} value={clientId} onChange={setClientId} includeGlobal fullWidth /></div>}
        <div className="result-compact-file"><label htmlFor="recon-file-input">RECON file</label><input id="recon-file-input" type="file" accept={fileAccept("RECON")} onChange={handleReconFileChange} disabled={isOffboarded} /></div>
        <button className="btn-gray result-process-button" onClick={uploadAndProcess} disabled={busy || isOffboarded}>{busy ? "Processing…" : "Process RECON"}</button>
      </div>
      {isOffboarded && <div className="result-upload-note">Uploads are locked for this offboarded client.</div>}
      {message && <div className={`result-message ${message.kind}`}>{message.text}</div>}
    </div>
    <div className="filters-bar result-filters"><select className="result-status-select" value={statusFilter} onChange={(event) => changeStatusFilter(event.target.value)} aria-label="Filter reconciliation results by status"><option value="">All</option>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select><div className="result-match-count" aria-live="polite" aria-label={`${data.total_claims ?? rows.length} matching results`}><strong>{Number(data.total_claims ?? rows.length).toLocaleString()}</strong><span>Matching Results</span></div><div className="result-global-search"><input type="search" value={search} onChange={(event) => { const value = event.target.value; setSearch(value); if (value) { statusFilterRef.current = ""; setStatusFilter(""); } }} placeholder="Search MIR/RECON data · separate multiple values with commas" aria-label="Search all MIR and RECON results; separate multiple values with commas" /></div><button type="button" className="btn-gray result-refresh-button" onClick={() => loadResults(page, activeSearch, sort, statusFilter)} disabled={busy}>Refresh</button><button type="button" className="btn-gray result-reconciliation-button" onClick={() => setReconciliationOpen(true)}>Action</button><button type="button" className="btn-gray result-export-button" onClick={downloadFilteredResults} disabled={exportBusy} aria-label={exportBusy ? "Preparing Excel download" : "Download filtered results as Excel"} title={exportBusy ? "Preparing Excel…" : "Download filtered results as Excel"}>{exportBusy ? <span className="spinner-icon" /> : <ExcelSheetIcon />}</button><button type="button" className="btn-gray result-files-button" onClick={openUploadedFiles}>Uploaded RECON files</button></div>
    <div className="card result-table-card"><div className="result-table-wrap"><table className="reconciliation-table"><colgroup><col className="result-col-claim" /><col className="result-col-patient" /><col className="result-col-file" /><col className="result-col-file" /><col className="result-col-money" /><col className="result-col-money" /><col className="result-col-difference" /><col className="result-col-status" /></colgroup><thead><tr><SortableHeader label="Claim ID" sortKey="claim_id" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="Patient name" sortKey="patient_name" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="MIR file" sortKey="mir_filename" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="RECON file" sortKey="recon_filename" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="Amount in MIR" sortKey="amount_to_pay" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="Amount in RECON" sortKey="recon_paid_amount" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="Difference" sortKey="difference_amount" sort={sort} onSort={changeSort} arrow={sortArrow} /><SortableHeader label="Status" sortKey="status" sort={sort} onSort={changeSort} arrow={sortArrow} /></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.mir_claim_id || `recon-${row.claim_id}`}><td><b>{row.claim_id || "—"}</b></td><td>{row.mir_claim_id ? <button className="result-name-link" onClick={() => openClaim(row)}>{row.patient_name || "View claim"}</button> : <span>RECON-only claim</span>}<small>{row.member_id || "—"}</small></td><td>{row.mir_filename || "—"}</td><td><ReconMatches row={row} onShowMore={() => setMatchHistory(row)} /></td><td className="num">{money(row.amount_to_pay)}</td><td className="num">{money(row.recon_paid_amount)}</td><td className="num">{hasMirAndRecon(row) ? money(row.difference_amount) : "-"}</td><td><span className={`tag ${tone(row.status)}`}>{label(row.status)}</span></td></tr>) : <tr><td colSpan="8" className="result-empty">No MIR or RECON claims match this search and status filter.</td></tr>}</tbody></table></div><div className="result-pagination">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginRight: "auto" }}>
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(event) => {
            const nextSize = Number(event.target.value);
            setPageSize(nextSize);
            setPage(1);
            loadResults(1, activeSearch, sort, statusFilter, nextSize);
          }}
          disabled={busy}
          aria-label="Rows per page"
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>
      <button className="btn-gray" disabled={page <= 1 || busy} onClick={() => loadResults(page - 1, activeSearch, sort, statusFilter)}>Previous</button>
      <span>Page {page} of {data.total_pages || 1}</span>
      <button className="btn-gray" disabled={page >= (data.total_pages || 1) || busy} onClick={() => loadResults(page + 1, activeSearch, sort, statusFilter)}>Next</button>
    </div></div>
    {detail && <div className="result-detail-backdrop" onClick={() => setDetail(null)}><div className="result-detail" onClick={(e) => e.stopPropagation()}><div className="result-detail-title"><div><div className="eyebrow">Claim reconciliation</div><h2>{detail.summary?.claim_id}</h2></div><button className="btn" onClick={() => setDetail(null)}>Close</button></div><div className="claim-summary-grid"><div><b>Patient</b><span>{detail.summary?.patient_name || "—"}</span></div><div><b>MIR / RECON services</b><span>{detail.summary?.mir_service_count} / {detail.summary?.recon_service_count}</span></div><div><b>Amount to pay</b><span>{money(detail.summary?.amount_to_pay)}</span></div><div><b>Paid / remaining</b><span>{money(detail.summary?.recon_paid_amount)} / {money(detail.summary?.remaining_amount)}</span></div></div><FileSectionHeading label="MIR services" filename={detail.mir.file} date={detail.mir.date} /><ServiceTable services={detail.mir.services} /><FileSectionHeading label="RECON services" filename={detail.recon.file || "Not in RECON"} date={detail.recon.date} /><ServiceTable services={detail.recon.services} /></div></div>}
    {filesOpen && <div className="result-detail-backdrop" onClick={() => setFilesOpen(false)}><div className="result-detail result-files-modal" role="dialog" aria-modal="true" aria-labelledby="uploaded-recon-title" onClick={(e) => e.stopPropagation()}><div className="result-detail-title"><div><div className="eyebrow">RECON archive</div><h2 id="uploaded-recon-title">Uploaded RECON files</h2></div><button className="btn" onClick={() => setFilesOpen(false)}>Close</button></div>{filesBusy ? <div className="result-empty">Loading uploaded files…</div> : uploadedFiles.length ? <div className="result-files-list">{uploadedFiles.map((file) => <div className="result-file-row" key={file.id}><div><b>{file.original_filename}</b><small>{showDate(file.uploaded_at)} · {file.status} · {Number(file.claim_count || 0).toLocaleString()} {Number(file.claim_count || 0) === 1 ? "claim" : "claims"} · {Number(file.file_size || 0).toLocaleString()} bytes</small><small>Import Mode: {String(file.import_mode || "MANUAL").toUpperCase() === "SFTP" ? "SFTP" : "MANUAL"}</small></div><button type="button" className="btn-gray" onClick={() => downloadRecon(file)}>Download</button></div>)}</div> : <div className="result-empty">No RECON files have been uploaded in this scope.</div>}</div></div>}
    {matchHistory && <div className="result-detail-backdrop" onClick={() => setMatchHistory(null)}><div className="result-detail result-files-modal" role="dialog" aria-modal="true" aria-labelledby="recon-history-title" onClick={(e) => e.stopPropagation()}><div className="result-detail-title"><div><div className="eyebrow">Claim RECON history</div><h2 id="recon-history-title">{matchHistory.claim_id}</h2></div><button className="btn" onClick={() => setMatchHistory(null)}>Close</button></div><div className="result-files-list">{(matchHistory.recon_matches || []).map((match) => <div className="result-file-row" key={`${match.recon_claim_id}-${match.filename}`}><div><b>{match.filename}</b><small>{showDate(match.date)} · {match.service_count} {match.service_count === 1 ? "service" : "services"}</small></div><div className="result-match-amount"><small>Amount in this RECON</small><b>{money(match.paid_amount)}</b></div></div>)}</div><div className="result-match-total"><span>Total across all matching RECON files</span><b>{money(matchHistory.recon_paid_amount)}</b></div></div></div>}
    {heldReview && <HeldReviewModal review={heldReview} onClose={() => setHeldReview(null)} />}
    {reconciliationOpen && <ReconciliationModal clientId={clientId} isAdmin={isAdmin} onClose={() => setReconciliationOpen(false)} />}
  </section>;
}

function SortableHeader({ label: headerLabel, sortKey, sort, onSort, arrow }) {
  const active = sort.key === sortKey;
  return <th aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}><button type="button" className={`result-sort-button${active ? " active" : ""}`} onClick={() => onSort(sortKey)}><span>{headerLabel}</span><span className="result-sort-arrow" aria-hidden="true">{arrow(sortKey)}</span></button></th>;
}

function ReconMatches({ row, onShowMore }) {
  const matches = row.recon_matches || [];
  if (!matches.length) return "—";
  return <div className="result-recon-matches">{matches.slice(0, 3).map((match) => <div className="result-recon-match" key={`${match.recon_claim_id}-${match.filename}`}><span>{match.filename}</span></div>)}{matches.length > 3 && <button type="button" className="result-show-more" onClick={onShowMore}>Show {matches.length - 3} more</button>}</div>;
}

function HeldReviewModal({ review, onClose }) {
  const errors = review.errors || [];
  return <div className="result-detail-backdrop" onClick={onClose}><div className="result-detail result-held-modal" role="dialog" aria-modal="true" aria-labelledby="held-review-title" onClick={(event) => event.stopPropagation()}><div className="result-detail-title"><div><div className="eyebrow">RECON processing review</div><h2 id="held-review-title">Held for Review</h2><p className="sub">{review.file?.original_filename} · {errors.length} {errors.length === 1 ? "record" : "records"} not imported</p></div><button className="btn" onClick={onClose}>Close</button></div><div className="result-table-wrap"><table className="result-held-table"><thead><tr><th>Row</th><th>Claim ID</th><th>Reason</th><th>Source record</th></tr></thead><tbody>{errors.length ? errors.map((error, index) => <tr key={`${error.row_number}-${error.error_code}-${index}`}><td>{error.row_number || "—"}</td><td><b>{error.claim_control_number || "Not identified"}</b></td><td><span className="tag bad">{String(error.error_code || "REVIEW").replaceAll("_", " ")}</span><small>{error.error_message || "Record requires review."}</small></td><td><code>{error.raw_record || "—"}</code></td></tr>) : <tr><td colSpan="4" className="result-empty">No held-record details are available.</td></tr>}</tbody></table></div></div></div>;
}

function FileSectionHeading({ label: sectionLabel, filename, date }) {
  return <div className="result-file-section-heading"><h3>{sectionLabel} · {filename}</h3>{date && <TimeDisplay value={date} easternOnly />}</div>;
}

function ServiceTable({ services = [] }) {
  return <div className="result-table-wrap"><table><thead><tr><th>#</th><th>Procedure</th><th>Date</th><th>Units</th><th>Charge</th><th>Allowed</th><th>Paid</th><th>Reason</th></tr></thead><tbody>{services.length ? services.map((s) => <tr key={s.sequence}><td>{s.sequence}</td><td>{s.procedure_code || s.revenue_code || "—"}</td><td>{s.service_date || s.service_from_date || "—"}</td><td>{s.units}</td><td>{money(s.charge_amount)}</td><td>{s.allowed_amount == null ? "—" : money(s.allowed_amount)}</td><td>{money(s.paid_amount)}</td><td>{s.reason_code || "—"}</td></tr>) : <tr><td colSpan="8" className="result-empty">No service rows.</td></tr>}</tbody></table></div>;
}
