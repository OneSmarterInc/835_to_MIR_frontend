import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./ResultView.css";

function authHeaders(extra = {}) {
  const token = localStorage.getItem("onesmarter_admin_token");
  return token ? { ...extra, Authorization: `Token ${token}` } : extra;
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Server returned a non-JSON response (${response.status}).`);
  }
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatMoney(value) {
  const number = Number(value || 0);
  return number.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function statusClass(status) {
  if (status === "PROCESSED") return "ok";
  if (status === "FAILED") return "bad";
  if (status === "PROCESSING") return "work";
  return "idle";
}

export default function ResultView({ clients = [], isAdmin = false, initialClientId = "" }) {
  const [clientId, setClientId] = useState(initialClientId || "");
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [processingId, setProcessingId] = useState("");
  const [message, setMessage] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (initialClientId) setClientId(initialClientId);
  }, [initialClientId]);

  const loadFiles = useCallback(async () => {
    try {
      const query = isAdmin && clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
      const data = await apiJson(`/edi835/api/recon/files/${query}`);
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (error) {
      setMessage({ kind: "error", text: error.message });
    }
  }, [clientId, isAdmin]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const processFile = async (fileId) => {
    setProcessingId(fileId);
    try {
      const data = await apiJson(`/edi835/api/recon/files/${fileId}/process/`, { method: "POST" });
      setMessage({
        kind: "success",
        text: `Processed ${data.file.claim_count} claims and ${data.file.service_count} service rows.`,
      });
      await loadFiles();
    } catch (error) {
      setMessage({ kind: "error", text: error.message });
      await loadFiles();
    } finally {
      setProcessingId("");
    }
  };

  const uploadAndProcess = async () => {
    setMessage(null);
    if (!selectedFile) {
      setMessage({ kind: "error", text: "Select a RECON file first." });
      return;
    }
    if (isAdmin && !clientId) {
      setMessage({ kind: "error", text: "Select a client before processing." });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("recon_file", selectedFile);
      if (isAdmin) form.append("client_id", clientId);
      const uploaded = await apiJson("/edi835/api/recon/upload/", { method: "POST", body: form });
      setSelectedFile(null);
      const input = document.getElementById("recon-file-input");
      if (input) input.value = "";
      await processFile(uploaded.file.id);
    } catch (error) {
      setMessage({ kind: "error", text: error.message });
      await loadFiles();
    } finally {
      setBusy(false);
    }
  };

  const viewDetail = async (fileId) => {
    try {
      const data = await apiJson(`/edi835/api/recon/files/${fileId}/`);
      setDetail(data);
    } catch (error) {
      setMessage({ kind: "error", text: error.message });
    }
  };

  const filteredFiles = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return files;
    return files.filter((item) =>
      [item.original_filename, item.client_name, item.client_code, item.id, item.status]
        .some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [files, search]);

  return (
    <section className="view on result-view">
      <div className="hdr-row result-header">
        <div>
          <div className="eyebrow">RECON Processing</div>
          <h1>Result</h1>
          <p className="sub">Upload, process, and review client RECON files and their structured claim records.</p>
        </div>
        <button className="btn" onClick={loadFiles} disabled={busy}>Refresh</button>
      </div>

      <div className="result-process-card">
        <div className="result-steps" aria-label="RECON processing steps">
          <span className="done">1 Upload</span><span>2 Validate</span><span>3 Process</span><span>4 Store</span>
        </div>
        <div className="result-form-grid">
          {isAdmin && (
            <label>
              <span>Client</span>
              <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
                <option value="">All Clients / Select for upload</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name} ({client.client_code || client.code || "—"})</option>
                ))}
              </select>
            </label>
          )}
          <label className="result-file-picker">
            <span>RECON file</span>
            <input
              id="recon-file-input"
              type="file"
              accept=".recon,.txt,.dat,.csv,.tsv"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            />
            <small>{selectedFile ? `${selectedFile.name} · ${(selectedFile.size / 1024).toFixed(1)} KB` : "CSV, TSV, pipe-delimited, or fixed-width · maximum 50 MB"}</small>
          </label>
          <button className="btn primary result-process-button" onClick={uploadAndProcess} disabled={busy || processingId !== ""}>
            {busy ? "Processing…" : "Process RECON"}
          </button>
        </div>
        {message && <div className={`result-message ${message.kind}`}>{message.text}</div>}
      </div>

      <div className="filters result-filters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search filename, ID, client, or status" />
        <span className="n">{filteredFiles.length} RECON files</span>
      </div>

      <div className="result-table-wrap">
        <table>
          <thead><tr>
            <th>Result ID</th>{isAdmin && <th>Client</th>}<th>RECON File</th><th>Uploaded</th>
            <th>Claims</th><th>Services</th><th>Total Charge</th><th>Total Paid</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {filteredFiles.length === 0 ? (
              <tr><td colSpan={isAdmin ? 10 : 9} className="result-empty">No RECON files found.</td></tr>
            ) : filteredFiles.map((item) => (
              <tr key={item.id}>
                <td className="num" title={item.id}>{item.id.slice(0, 8)}</td>
                {isAdmin && <td><b>{item.client_name}</b><small className="result-cell-note">{item.client_code}</small></td>}
                <td><b>{item.original_filename}</b><small className="result-cell-note">{(item.file_size / 1024).toFixed(1)} KB</small></td>
                <td className="num">{formatDate(item.uploaded_at)}</td>
                <td className="num">{item.claim_count}</td><td className="num">{item.service_count}</td>
                <td className="num">{formatMoney(item.total_charge_amount)}</td><td className="num">{formatMoney(item.total_paid_amount)}</td>
                <td><span className={`tag ${statusClass(item.status)}`}>{item.status}</span>{item.processing_error && <small className="result-error-note">{item.processing_error}</small>}</td>
                <td className="result-actions">
                  <button className="btn small" onClick={() => viewDetail(item.id)}>View</button>
                  {item.status !== "PROCESSING" && <button className="btn small" onClick={() => processFile(item.id)} disabled={processingId === item.id}>{processingId === item.id ? "Processing…" : "Process"}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="result-detail-backdrop" onClick={() => setDetail(null)}>
          <div className="result-detail" onClick={(event) => event.stopPropagation()}>
            <div className="result-detail-title"><div><div className="eyebrow">Parsed Claims</div><h2>{detail.file.original_filename}</h2></div><button className="btn" onClick={() => setDetail(null)}>Close</button></div>
            <div className="result-table-wrap"><table><thead><tr><th>#</th><th>Claim ID</th><th>Member ID</th><th>Status</th><th>Services</th><th>Charge</th><th>Allowed</th><th>Paid</th></tr></thead>
              <tbody>{detail.claims.length ? detail.claims.map((claim) => <tr key={claim.id}><td>{claim.claim_sequence}</td><td><b>{claim.claim_control_number}</b></td><td>{claim.member_id || "—"}</td><td>{claim.claim_status || "—"}</td><td className="num">{claim.service_count}</td><td className="num">{formatMoney(claim.charge_amount)}</td><td className="num">{formatMoney(claim.allowed_amount)}</td><td className="num">{formatMoney(claim.paid_amount)}</td></tr>) : <tr><td colSpan="8" className="result-empty">Process this file to view claims.</td></tr>}</tbody>
            </table></div>
          </div>
        </div>
      )}
    </section>
  );
}
