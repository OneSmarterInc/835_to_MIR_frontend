import React, { useCallback, useEffect, useMemo, useState } from "react";
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
const label = (value) => ({ NOT_IN_RECON: "Not in RECON", SIGNATURE_MISMATCH: "Signature mismatch", CLEAR: "Clear", PARTIALLY_PAID: "Partially paid", OVERPAID: "Overpaid", UNPAID: "Unpaid", AMOUNT_MISMATCH: "Amount mismatch" }[value] || value);
const tone = (value) => value === "CLEAR" ? "ok" : value === "NOT_IN_RECON" || value === "UNPAID" ? "idle" : "bad";

export default function ResultView({ clients = [], isAdmin = false, initialClientId = "" }) {
  const [clientId, setClientId] = useState(initialClientId || "");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedReconId, setSelectedReconId] = useState("");
  const [data, setData] = useState({ claims: [], recon_files: [] });
  const [filters, setFilters] = useState({ claim: "", name: "", mir: "", recon: "", status: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [detail, setDetail] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => { if (initialClientId) setClientId(initialClientId); }, [initialClientId]);
  const loadResults = useCallback(async (requestedReconId = "", requestedPage = 1) => {
    if (isAdmin && !clientId) { setData({ claims: [], recon_files: [] }); return; }
    try {
      const params = new URLSearchParams();
      if (isAdmin && clientId) params.set("client_id", clientId);
      if (isAdmin && !clientId) params.set("scope", "global");
      if (requestedReconId) params.set("recon_file_id", requestedReconId);
      params.set("page", String(requestedPage));
      params.set("page_size", "100");
      const result = await apiJson(`/edi835/api/reconciliation/?${params}`);
      setData(result);
      setPage(result.page || requestedPage);
      setSelectedReconId(result.selected_recon_file_id || "");
    } catch (error) { setMessage({ kind: "error", text: error.message }); }
  }, [clientId, isAdmin]);
  useEffect(() => { setSelectedReconId(""); setPage(1); loadResults("", 1); }, [loadResults]);

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
      await loadResults(uploaded.file.id, 1);
    } catch (error) { setMessage({ kind: "error", text: error.message }); } finally { setBusy(false); }
  };
  const openClaim = async (row) => {
    try {
      const query = selectedReconId ? `?recon_file_id=${encodeURIComponent(selectedReconId)}` : "";
      setDetail(await apiJson(`/edi835/api/reconciliation/claims/${row.mir_claim_id}/${query}`));
    } catch (error) { setMessage({ kind: "error", text: error.message }); }
  };
  const rows = useMemo(() => data.claims.filter((row) =>
    (!filters.claim || row.claim_id.toLowerCase().includes(filters.claim.toLowerCase())) &&
    (!filters.name || row.patient_name.toLowerCase().includes(filters.name.toLowerCase())) &&
    (!filters.mir || row.mir_filename.toLowerCase().includes(filters.mir.toLowerCase())) &&
    (!filters.recon || row.recon_filename.toLowerCase().includes(filters.recon.toLowerCase())) &&
    (!filters.status || row.status === filters.status)
  ), [data.claims, filters]);
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  return <section className="view on result-view">
    <div className="eyebrow">Operations Studio</div><h1>Result</h1>
    <p className="sub">Compare every MIR claim with the selected RECON payment file.</p>
    <div className="start-conversion-card result-process-card">
      {isAdmin && <div className="result-client-bar"><label>Associate with Client:</label><select value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">-- None (Global System Default) --</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.client_code || c.code || "—"})</option>)}</select></div>}
      <div className="start-conversion-header"><h2>Upload RECON</h2><div className="step-pills"><span className="step-pill active">1 · UPLOAD</span><span className="step-arrow">→</span><span className="step-pill">2 · PROCESS</span><span className="step-arrow">→</span><span className="step-pill">3 · RECONCILE</span></div></div>
      <div className="conversion-boxes result-conversion-boxes"><div className="c-box"><div className="c-box-label">RECON INPUT</div><input id="recon-file-input" type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} /><div className="subtext">{selectedFile ? selectedFile.name : "Any RECON filename or extension, including .p7a"}</div></div><div className="c-actions result-c-actions"><button className="btn-gray" onClick={uploadAndProcess} disabled={busy}>{busy ? "Processing…" : "Process RECON"}</button><button className="btn-gray" onClick={() => loadResults(selectedReconId, page)} disabled={busy}>Refresh</button></div></div>
      {message && <div className={`result-message ${message.kind}`}>{message.text}</div>}
    </div>
    <div className="filters-bar result-filters"><label>RECON file <select value={selectedReconId} onChange={(e) => { setSelectedReconId(e.target.value); setPage(1); loadResults(e.target.value, 1); }}><option value="">{data.recon_files.length ? "Latest processed RECON" : "No RECON uploaded — MIR claims only"}</option>{data.recon_files.map((f) => <option key={f.id} value={f.id}>{f.original_filename} · {showDate(f.processed_at)}</option>)}</select></label><span className="runs-counter">{data.total_claims ?? rows.length} MIR claims</span></div>
    <div className="card result-table-card"><div className="result-table-wrap"><table className="reconciliation-table"><thead><tr><th>Claim ID<input value={filters.claim} onChange={(e) => setFilter("claim", e.target.value)} /></th><th>Patient name<input value={filters.name} onChange={(e) => setFilter("name", e.target.value)} /></th><th>MIR file / date<input value={filters.mir} onChange={(e) => setFilter("mir", e.target.value)} /></th><th>RECON file / date<input value={filters.recon} onChange={(e) => setFilter("recon", e.target.value)} /></th><th>Amount in MIR</th><th>Amount in RECON</th><th>Difference</th><th>Status<select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}><option value="">All</option>{["CLEAR","NOT_IN_RECON","SIGNATURE_MISMATCH","PARTIALLY_PAID","OVERPAID","UNPAID","AMOUNT_MISMATCH"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.mir_claim_id}><td><b>{row.claim_id || "—"}</b></td><td><button className="result-name-link" onClick={() => openClaim(row)}>{row.patient_name || "View claim"}</button><small>{row.member_id || "—"}</small></td><td>{row.mir_filename}<small>{showDate(row.mir_date)}</small></td><td>{row.recon_filename || "—"}<small>{showDate(row.recon_date)}</small></td><td className="num">{money(row.amount_to_pay)}</td><td className="num">{money(row.recon_paid_amount)}</td><td className="num">{money(row.difference_amount)}</td><td><span className={`tag ${tone(row.status)}`}>{label(row.status)}</span></td></tr>) : <tr><td colSpan="8" className="result-empty">No MIR claims are stored for the selected scope.</td></tr>}</tbody></table></div><div className="result-pagination"><button className="btn-gray" disabled={page <= 1 || busy} onClick={() => loadResults(selectedReconId, page - 1)}>Previous</button><span>Page {page} of {data.total_pages || 1}</span><button className="btn-gray" disabled={page >= (data.total_pages || 1) || busy} onClick={() => loadResults(selectedReconId, page + 1)}>Next</button></div></div>
    {detail && <div className="result-detail-backdrop" onClick={() => setDetail(null)}><div className="result-detail" onClick={(e) => e.stopPropagation()}><div className="result-detail-title"><div><div className="eyebrow">Claim reconciliation</div><h2>{detail.summary?.claim_id}</h2></div><button className="btn" onClick={() => setDetail(null)}>Close</button></div><div className="claim-summary-grid"><div><b>Patient</b><span>{detail.summary?.patient_name || "—"}</span></div><div><b>MIR / RECON services</b><span>{detail.summary?.mir_service_count} / {detail.summary?.recon_service_count}</span></div><div><b>Amount to pay</b><span>{money(detail.summary?.amount_to_pay)}</span></div><div><b>Paid / remaining</b><span>{money(detail.summary?.recon_paid_amount)} / {money(detail.summary?.remaining_amount)}</span></div></div><h3>MIR services · {detail.mir.file}</h3><ServiceTable services={detail.mir.services} /><h3>RECON services · {detail.recon.file || "Not in RECON"}</h3><ServiceTable services={detail.recon.services} /></div></div>}
  </section>;
}

function ServiceTable({ services = [] }) {
  return <div className="result-table-wrap"><table><thead><tr><th>#</th><th>Procedure</th><th>Date</th><th>Units</th><th>Charge</th><th>Allowed</th><th>Paid</th><th>Reason</th></tr></thead><tbody>{services.length ? services.map((s) => <tr key={s.sequence}><td>{s.sequence}</td><td>{s.procedure_code || s.revenue_code || "—"}</td><td>{s.service_date || s.service_from_date || "—"}</td><td>{s.units}</td><td>{money(s.charge_amount)}</td><td>{s.allowed_amount == null ? "—" : money(s.allowed_amount)}</td><td>{money(s.paid_amount)}</td><td>{s.reason_code || "—"}</td></tr>) : <tr><td colSpan="8" className="result-empty">No service rows.</td></tr>}</tbody></table></div>;
}
