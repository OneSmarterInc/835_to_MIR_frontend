import React, { useEffect, useState } from "react";
import FileActionButtons from "../components/FileActionButtons";
import { formatEasternDate } from "../utils/timezone";
import TimeDisplay from "../components/TimeDisplay";
import ClientSelectDropdown from "../onesmarter_admin/components/ClientSelectDropdown";
import { showAppAlert } from "../components/AppDialog";
import { fileAccept, validateFileExtensions } from "../utils/fileTypes";
import OffboardedClientBanner from "../onesmarter_admin/components/OffboardedClientBanner";

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem("onesmarter_admin_token");
  return token ? { ...extra, Authorization: `Token ${token}` } : extra;
}

function getApiUrl(path) {
  const configuredBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  if (configuredBase) return `${configuredBase}${path}`;
  return path;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Server returned a non-JSON response (${response.status}).`);
  }
  return response.json();
}

export default function ConversionsView({
  trackedFiles,
  onRefreshData,
  onOpenFileModal,
  clients = [],
  isAdmin = false,
  activeClientId = "",
  onSelectClient,
  selectedClient,
}) {
  const [selectedClientId, setSelectedClientId] = useState(
    isAdmin ? activeClientId || "" : ""
  );
  const currentAdminClient = clients.find((item) => String(item.id) === String(selectedClientId)) || selectedClient;
  const isOffboarded = isAdmin && String(currentAdminClient?.stage || '').toLowerCase() === 'offboarded';

  useEffect(() => {
    if (isAdmin) {
      setSelectedClientId(activeClientId || "");
      setCurrentPage(1);
    }
  }, [activeClientId, isAdmin]);
  // Conversion Form State
  const [selectedFilesList, setSelectedFilesList] = useState([]);
  const [ediText, setEdiText] = useState("");
  const [currentFileName, setCurrentFileName] = useState("uploaded_file.x12");
  const [file835Subtext, setFile835Subtext] = useState("No 835 files selected.");
  const [file837Subtext, setFile837Subtext] = useState("No 837 reference selected.");
  const [activeValidatedFileId, setActiveValidatedFileId] = useState(null);

  const [validating, setValidating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [convertingId, setConvertingId] = useState(null);
  const [startingBatch, setStartingBatch] = useState(false);

  const [validationReport, setValidationReport] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [isValidated, setIsValidated] = useState(false);

  const [mirOutputText, setMirOutputText] = useState("");
  const [copyStatus, setCopyStatus] = useState("Copy Text");

  // Step Pills State
  const [step1State, setStep1State] = useState("active");
  const [step2State, setStep2State] = useState("");
  const [step3State, setStep3State] = useState("");

  // Table Filters, Sort, Pagination
  const [searchText, setSearchText] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");

  // 835 File Input change (Supports multiple file selection)
  const handle835FileChange = async (e) => {
    if (isOffboarded) { e.target.value = ""; return; }
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    const extensionError = validateFileExtensions(files, "835");
    if (extensionError) {
      e.target.value = "";
      setSelectedFilesList([]);
      setEdiText("");
      setFile835Subtext("No 835 files selected.");
      setValidationError(extensionError);
      await showAppAlert(extensionError, { title: "Wrong File Format", tone: "error" });
      return;
    }

    if (files.length === 1) {
      const file = files[0];
      setCurrentFileName(file.name);
      setFile835Subtext("Selected: " + file.name);
      const reader = new FileReader();
      reader.onload = (evt) => {
        setEdiText(evt.target.result);
        setSelectedFilesList([{ filename: file.name, content: evt.target.result }]);
        resetConversionForm();
      };
      reader.readAsText(file);
    } else {
      setCurrentFileName(`Batch (${files.length} files)`);
      setFile835Subtext(`Selected ${files.length} 835 files: ${files.map((f) => f.name).join(", ")}`);

      const filePromises = files.map((file) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            resolve({ filename: file.name, content: evt.target.result });
          };
          reader.readAsText(file);
        });
      });

      const loadedFiles = await Promise.all(filePromises);
      setSelectedFilesList(loadedFiles);
      setEdiText(loadedFiles.map((f) => f.content).join("\n"));
      resetConversionForm();
    }
  };

  // 837 File Input change
  const handle837FileChange = async (e) => {
    if (isOffboarded) { e.target.value = ""; return; }
    if (e.target.files && e.target.files.length > 0) {
      const extensionError = validateFileExtensions(e.target.files, "837");
      if (extensionError) {
        e.target.value = "";
        setFile837Subtext("No 837 reference selected.");
        await showAppAlert(extensionError, { title: "Wrong File Format", tone: "error" });
        return;
      }
      setFile837Subtext(
        "Selected: " + e.target.files[0].name + " (optional reference)"
      );
    }
  };

  const resetConversionForm = () => {
    setValidationError(null);
    setValidationReport(null);
    setIsValidated(false);
    setMirOutputText("");
    setActiveValidatedFileId(null);
    setStep1State("active");
    setStep2State("");
    setStep3State("");
  };

  // Validate 835 Action (Single or Multi-file)
  const handleValidate = async () => {
    if (isOffboarded) return;
    setValidationError(null);
    setValidationReport(null);
    setMirOutputText("");

    if (selectedFilesList.length === 0 && !ediText.trim()) {
      setValidationError("Please select 835 file(s) to validate.");
      return;
    }

    setValidating(true);
    try {
      const payload = {
        ...(selectedFilesList.length > 1
          ? { files: selectedFilesList }
          : { edi_text: ediText.trim(), original_filename: currentFileName }),
        client_id: selectedClientId || undefined
      };

      const res = await fetch("/api/validate/", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.file_id) setActiveValidatedFileId(data.file_id);

      if (!res.ok || data.error) {
        throw new Error(data.error || "Validation failed");
      }

      const report = data.report;
      const valid = report.valid !== undefined ? report.valid : report.is_valid;
      setValidationReport(report);

      if (valid) {
        setIsValidated(true);
        setStep1State("done");
        setStep2State("done");
        setStep3State("active");
      } else {
        setIsValidated(false);
        setStep1State("done");
        setStep2State("active");
        setStep3State("");
      }

      if (onRefreshData) onRefreshData();
    } catch (err) {
      setValidationError("Validation error: " + err.message);
      if (onRefreshData) onRefreshData();
    } finally {
      setValidating(false);
    }
  };

  // Process MIR Action (Converts single or multiple 835 files into a SINGLE combined MIR file)
  const handleProcessMIR = async () => {
    if (isOffboarded) return;
    if (selectedFilesList.length === 0 && !ediText.trim()) return;

    setProcessing(true);
    setValidationError(null);

    try {
      const payload = {
        ...(selectedFilesList.length > 1
          ? { files: selectedFilesList }
          : {
              edi_text: ediText.trim(),
              original_filename: currentFileName,
              file_id: activeValidatedFileId,
            }),
        client_id: selectedClientId || undefined
      };

      const res = await fetch("/api/convert/", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Conversion failed");
      }

      setMirOutputText(data.text);
      if (data.combined_filename) {
        setCurrentFileName(data.combined_filename);
      }
      setStep1State("done");
      setStep2State("done");
      setStep3State("done");

      if (onRefreshData) onRefreshData();
    } catch (err) {
      setValidationError("Conversion error: " + err.message);
      if (onRefreshData) onRefreshData();
    } finally {
      setProcessing(false);
    }
  };

  // Convert file to MIR on clicking PROCESSING status in table
  const handleConvertStatusClick = async (fileId) => {
    if (isOffboarded) return;
    if (!fileId || convertingId) return;
    setConvertingId(fileId);
    try {
      const res = await fetch("/api/convert/", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, client_id: selectedClientId || undefined }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        await showAppAlert(data.error || "Failed to convert file to MIR.", { title: "Conversion Failed", tone: "error" });
      } else {
        if (data.text) setMirOutputText(data.text);
      }
    } catch (err) {
      await showAppAlert("Error converting file: " + err.message, { title: "Conversion Failed", tone: "error" });
    } finally {
      setConvertingId(null);
      if (onRefreshData) onRefreshData();
    }
  };

  // Copy MIR Text
  const handleCopyMir = () => {
    if (!mirOutputText) return;
    navigator.clipboard.writeText(mirOutputText).then(() => {
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus("Copy Text"), 2000);
    });
  };

  // Download MIR File
  const handleDownloadMir = async (fileName, content, fileId) => {
    const textToDownload = content || mirOutputText;
    const nameToSave = fileName || currentFileName.replace(/\.[^/.]+$/, "") + ".mir";

    if (textToDownload) {
      const blob = new Blob([textToDownload], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nameToSave;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
      return;
    }

    try {
      const query = new URLSearchParams();
      const targetId = fileId || activeValidatedFileId;
      if (targetId) query.append("file_id", targetId);
      if (nameToSave) query.append("file_name", nameToSave);

      const res = await fetch(`/api/download/?${query.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObj;
      a.download = nameToSave;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(urlObj);
        a.remove();
      }, 1000);
    } catch (err) {
      await showAppAlert("Download error: " + err.message, { title: "Download Failed", tone: "error" });
    }
  };

  // Start Automated SFTP Inbound Batch Pipeline
  const handleStartBatchConversion = async () => {
    if (isOffboarded) return;
    setStartingBatch(true);
    try {
      const res = await fetch(getApiUrl("/edi835/api/start-batch-conversion/"), {
        method: "POST",
        credentials: "include",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          client_id: isAdmin ? selectedClientId || undefined : undefined,
        }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok || !data.success || !data.job_id) {
        throw new Error(data.error || data.message || "Batch conversion could not be started.");
      }

      let completedData = null;
      for (let attempt = 0; attempt < 240; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const statusRes = await fetch(
          getApiUrl(`/edi835/api/start-batch-conversion/?job_id=${encodeURIComponent(data.job_id)}`),
          {
            method: "GET",
            credentials: "include",
            headers: getAuthHeaders({ Accept: "application/json" }),
          }
        );
        const statusData = await readJsonResponse(statusRes);
        if (!statusRes.ok || !statusData.success) {
          throw new Error(statusData.error || "Unable to read batch status.");
        }
        if (statusData.job?.state === "COMPLETED" || statusData.job?.state === "FAILED") {
          completedData = statusData.job.result || {};
          break;
        }
      }

      if (!completedData) {
        throw new Error("The batch is still running. Refresh and try again after a few minutes.");
      }

      if (completedData.success) {
        const sftp837Files = Array.isArray(completedData.sftp_837_files)
          ? completedData.sftp_837_files
          : [];
        const sftpReconFiles = Array.isArray(completedData.sftp_recon_files)
          ? completedData.sftp_recon_files
          : [];
        const importedReferenceFiles = [...sftp837Files, ...sftpReconFiles];
        if (importedReferenceFiles.length) {
          const importedCount = importedReferenceFiles.filter((item) => !item.already_exists).length;
          const existingCount = importedReferenceFiles.length - importedCount;
          setFile837Subtext(
            `SFTP: ${importedCount} new 837/RECON file(s) imported` +
            (existingCount ? `, ${existingCount} already imported` : ``)
          );
        } else {
          setFile837Subtext("No new 837/RECON files found in the configured SFTP folder.");
        }
        if (onRefreshData) onRefreshData();
      } else {
        setValidationError(completedData.error || completedData.message || "Batch conversion failed.");
      }
    } catch (err) {
      setValidationError(err.message);
    } finally {
      setStartingBatch(false);
    }
  };

  // Table Sorting & Filtering
  const handleSortHeader = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  let filtered = (trackedFiles || []).filter((item) => {
    if (isAdmin) {
      const rowClientId = item.client_id ? String(item.client_id) : "";
      if (rowClientId !== String(selectedClientId || "")) return false;
    }
    if (searchText) {
      const query = searchText.toLowerCase();
      const fullStr = (
        item.id +
        " " +
        item.original_filename +
        " " +
        (item.output_path || "")
      ).toLowerCase();
      if (!fullStr.includes(query)) return false;
    }
    return true;
  });

  // Sort logic
  filtered.sort((a, b) => {
    const mult = sortOrder === "asc" ? 1 : -1;
    let valA, valB;
    if (sortKey === "date" || sortKey === "time") {
      valA = new Date(a.uploaded_at || 0).getTime();
      valB = new Date(b.uploaded_at || 0).getTime();
    } else if (sortKey === "id") {
      valA = (a.id || "").toLowerCase();
      valB = (b.id || "").toLowerCase();
    } else if (sortKey === "filename") {
      valA = (a.original_filename || "").toLowerCase();
      valB = (b.original_filename || "").toLowerCase();
    } else if (sortKey === "claims") {
      valA = a.claims_count || 0;
      valB = b.claims_count || 0;
    } else if (sortKey === "status") {
      valA = (a.status || "").toLowerCase();
      valB = (b.status || "").toLowerCase();
    } else {
      valA = 0;
      valB = 0;
    }

    if (valA < valB) return -1 * mult;
    if (valA > valB) return 1 * mult;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);
  const startIndex = (pageIndex - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize);

  return (
    <section className="view on" id="v-batches">
      <div className="eyebrow">Operations Studio</div>
      <h1>Conversions</h1>
      <p className="sub">
        Start a conversion run, validate EDI 835 files, and view 30-day conversion history.
      </p>

      {/* START A CONVERSION CARD */}
      <div className="start-conversion-card">
        {isAdmin && clients && clients.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '12px 20px', borderBottom: '1px solid var(--line, #e2e8f0)', background: '#F8FAFC', boxSizing: 'border-box', width: '100%' }}>
            <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Associate with Client:</label>
            <div style={{ flex: '1 1 620px', maxWidth: '820px', minWidth: 0 }}>
              <ClientSelectDropdown
              clients={clients}
              value={selectedClientId}
              includeGlobal
              fullWidth
              onChange={(clientId) => {
                setSelectedClientId(clientId);
                if (onSelectClient) onSelectClient(clientId);
                setCurrentPage(1);
              }}
            /></div>
          </div>
        )}
        <OffboardedClientBanner client={currentAdminClient} detail="Conversion history remains available for review. New uploads, validation, MIR processing, and SFTP batch runs are locked." />
        <div className="start-conversion-header">
          <h2>Start a conversion</h2>
          <div className="step-pills">
            <span className={`step-pill ${step1State}`} id="pillStep1">
              1 &bull; UPLOAD 835
            </span>
            <span className="step-arrow">&rarr;</span>
            <span className={`step-pill ${step2State}`} id="pillStep2">
              2 &bull; VALIDATE
            </span>
            <span className="step-arrow">&rarr;</span>
            <span className={`step-pill ${step3State}`} id="pillStep3">
              3 &bull; PROCESS MIR
            </span>
          </div>
        </div>

        <div className="conversion-boxes">
          {/* REQUIRED 835 INPUT BOX */}
          <div className="c-box">
            <div className="c-box-label">REQUIRED &bull; 835 INPUT</div>
            <input
              type="file"
              accept={fileAccept("835")}
              multiple
              onChange={handle835FileChange}
              disabled={isOffboarded}
            />
            <div className="subtext">{file835Subtext}</div>
          </div>

          {/* OPTIONAL 837 REFERENCE BOX */}
          <div className="c-box">
            <div className="c-box-label">OPTIONAL &bull; 837 REFERENCE ONLY</div>
            <input type="file" accept={fileAccept("837")} onChange={handle837FileChange} disabled={isOffboarded} />
            <div className="subtext">{file837Subtext}</div>
          </div>

          {/* ACTION BUTTONS WITH ICONS */}
          <div className="c-actions">
            <button
              type="button"
              className="btn-gray"
              onClick={handleValidate}
              disabled={validating || isOffboarded}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <span>{validating ? "Validating..." : "Validate 835"}</span>
            </button>

            <button
              type="button"
              className={isValidated && !processing ? "btn-gray" : "btn-disabled"}
              onClick={handleProcessMIR}
              disabled={!isValidated || processing || isOffboarded}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>{processing ? "Processing MIR..." : "Process MIR"}</span>
            </button>

            <button
              type="button"
              className="btn-gray"
              onClick={handleStartBatchConversion}
              disabled={startingBatch || isOffboarded}
              title="Test SFTP Inbound Batch Conversion: Processes 835 and RECON files from their configured folders, updates MIR and reconciliation results, and removes successfully processed source files from SFTP."
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>{startingBatch ? "Testing..." : "Test"}</span>
            </button>
          </div>
        </div>

        {/* ERROR ALERT BOX */}
        {validationError && (
          <div className="error-msg" style={{ marginTop: "14px" }}>
            {validationError}
          </div>
        )}

        {/* VALIDATION RESULT REPORT */}
        {validationReport && (
          <div style={{ marginTop: "14px" }}>
            <div
              className={`status-banner ${
                validationReport.valid !== false && validationReport.is_valid !== false
                  ? "valid"
                  : "invalid"
              }`}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: "14px" }}>
                  {validationReport.valid !== false && validationReport.is_valid !== false
                    ? "✓ EDI File Validated Successfully"
                    : "✕ EDI Validation Failed"}
                </div>
                <div style={{ fontSize: "12px", marginTop: "2px" }}>
                  {validationReport.status_message ||
                    (validationReport.valid !== false && validationReport.is_valid !== false
                      ? "PyX12 Engine: All envelope headers and segment rules passed. Ready for Process MIR."
                      : "PyX12 Engine: Structural or syntax errors found.")}
                </div>
              </div>
            </div>

            <div className="metrics">
              <div className="metric">
                <div className="v">{validationReport.total_segments || 0}</div>
                <div className="l">Total Segments</div>
              </div>
              <div className="metric">
                <div className="v">
                  {validationReport.claims !== undefined
                    ? validationReport.claims
                    : validationReport.claims_found || 0}
                </div>
                <div className="l">Claims Identified</div>
              </div>
              <div className="metric">
                <div className="v" style={{ color: "var(--brick)" }}>
                  {(validationReport.errors || []).length}
                </div>
                <div className="l">Errors</div>
              </div>
              <div className="metric">
                <div className="v" style={{ color: "var(--ochre)" }}>
                  {(validationReport.warnings || []).length}
                </div>
                <div className="l">Warnings</div>
              </div>
            </div>

            {validationReport.errors && validationReport.errors.length > 0 && (
              <div style={{ marginBottom: "12px" }}>
                <div className="eyebrow" style={{ color: "var(--brick)", marginBottom: "6px" }}>
                  Errors Found
                </div>
                {validationReport.errors.map((err, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "var(--brick-bg)",
                      borderLeft: "3px solid var(--brick)",
                      padding: "8px 12px",
                      marginBottom: "6px",
                      fontSize: "12px",
                    }}
                  >
                    <span>
                      Line {err.line || "N/A"}: {err.message || err}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FILTERS CONTROL BAR */}
      <div
        className="filters-bar"
        style={{
          display: "flex",
          alignItems: "center",
          justifySpaceBetween: "space-between",
          marginBottom: "12px",
        }}
      >
        <input
          type="text"
          placeholder="Search run, 835 file, or MIR file"
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setCurrentPage(1);
          }}
          style={{
            padding: "7px 12px",
            fontSize: "12px",
            border: "1px solid var(--line)",
            borderRadius: "4px",
            width: "280px",
          }}
        />
        <span
          className="runs-counter"
          style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-3)" }}
        >
          {filtered.length} runs
        </span>
      </div>

      {/* CONVERSIONS TABLE */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "16px" }}>
        <div style={{ width: "100%", overflow: "hidden" }}>
          <table style={{ width: "100%", maxWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th
                  className={`sortable ${sortKey === "id" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("id")}
                >
                  RUN{" "}
                  <span className="sort-arrow">
                    {sortKey === "id" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th
                  className={`sortable ${sortKey === "date" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("date")}
                >
                  835 DATE{" "}
                  <span className="sort-arrow">
                    {sortKey === "date" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th
                  className={`sortable ${sortKey === "time" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("time")}
                >
                  TIMESTAMP (EST){" "}
                  <span className="sort-arrow">
                    {sortKey === "time" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th
                  className={`sortable ${sortKey === "filename" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("filename")}
                >
                  835 IN{" "}
                  <span className="sort-arrow">
                    {sortKey === "filename" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th>837 REF</th>
                <th
                  className={`sortable ${sortKey === "claims" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("claims")}
                >
                  CLAIMS{" "}
                  <span className="sort-arrow">
                    {sortKey === "claims" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th>MIR OUT</th>
                <th
                  className={`sortable ${sortKey === "status" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("status")}
                >
                  STATUS{" "}
                  <span className="sort-arrow">
                    {sortKey === "status" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td
                    colSpan="9"
                    style={{ padding: "26px", textAlign: "center", color: "var(--ink-3)" }}
                  >
                    No conversion runs match search query.
                  </td>
                </tr>
              ) : (
                pageItems.map((f) => {
                  const upDate = formatEasternDate(f.uploaded_at);
                  const shortId = "R-" + f.id.substring(0, 6).toUpperCase();
                  const mirName =
                    f.output_filename ||
                    f.mir_filename ||
                    f.combined_filename ||
                    (f.output_path ? f.output_path.split("/").pop() : "") ||
                    "MIR_" +
                      (f.original_filename || "").split(",")[0].trim().replace(/\.[^/.]+$/, "") +
                      ".mir";

                  let statusTitle = "";
                  if (f.status === "PROCESSING") {
                    statusTitle = "PROCESSING: 835 EDI file validated and stored in archive folder. Click to convert file into MIR.";
                  } else if (f.status === "ARCHIVED") {
                    statusTitle = "ARCHIVED: File successfully converted into MIR format and stored in output/archive folders.";
                  } else if (f.status === "ERROR") {
                    statusTitle = f.error_message
                      ? `ERROR: ${f.error_message}`
                      : "ERROR: Validation or processing failed during conversion.";
                  } else if (f.status === "UPLOADED") {
                    statusTitle = "UPLOADED: File received, pending validation and processing.";
                  } else {
                    statusTitle = `${f.status}: Current status of 835 file.`;
                  }

                  return (
                    <tr key={f.id}>
                      <td className="num" style={{ fontWeight: 600, fontSize: "11.5px" }}>
                        {shortId}
                      </td>
                      <td className="num">{upDate}</td>
                      <td className="num" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}><TimeDisplay value={f.uploaded_at} includeSeconds easternOnly /></td>
                      <td className="num" style={{ color: "var(--ink-2)", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                        {f.original_filename}
                      </td>
                      <td className="num" style={{ color: "var(--ink-3)" }}>
                        —
                      </td>
                      <td className="num">{f.claims_count || 0}</td>
                      <td className="num" style={{ color: "var(--ink-2)", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                        {f.status === "ARCHIVED" ? mirName : "—"}
                      </td>
                      <td>
                        <span
                          className={`tag ${
                            f.status === "ARCHIVED"
                              ? "ok"
                              : f.status === "ERROR"
                              ? "bad"
                              : "work"
                          }`}
                          style={{
                            cursor: f.status === "PROCESSING" ? "pointer" : "default",
                          }}
                          title={statusTitle}
                          onClick={() => {
                            if (f.status === "PROCESSING") {
                              handleConvertStatusClick(f.id);
                            }
                          }}
                        >
                          {convertingId === f.id ? "CONVERTING..." : f.status}
                        </span>
                      </td>
                      <td className="num" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                        <FileActionButtons
                          onView={() => onOpenFileModal(f.id)}
                          onDownload={f.status === "ARCHIVED" ? () => handleDownloadMir(mirName, "", f.id) : null}
                          viewTitle="View / Edit Code"
                          downloadTitle="Download .mir File"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* CONVERSIONS PAGINATION CONTROL FOOTER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderTop: "1px solid var(--line)",
            background: "var(--surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "11px", color: "var(--ink-3)" }}>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setCurrentPage(1);
              }}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                border: "1px solid var(--line)",
                borderRadius: "4px",
              }}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              className="btn secondary"
              style={{ padding: "4px 10px", fontSize: "11px" }}
              disabled={pageIndex <= 1}
              onClick={() => setCurrentPage(pageIndex - 1)}
            >
              &ndash; Previous
            </button>
            <span style={{ fontSize: "11px", color: "var(--ink-2)" }}>
              Page {pageIndex} of {totalPages}
            </span>
            <button
              className="btn secondary"
              style={{ padding: "4px 10px", fontSize: "11px" }}
              disabled={pageIndex >= totalPages}
              onClick={() => setCurrentPage(pageIndex + 1)}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* OPERATIONAL VIEW BANNER */}
      <div className="stub">
        <b>30-day operational view.</b> This table is intentionally limited by the backend to the
        latest 30 days. Every uploaded 835 and every generated MIR is also written to the
        SQLite-backed Archive.
      </div>
    </section>
  );
}
