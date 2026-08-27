import React, { useState } from "react";

export default function ArchiveView({
  metrics,
  trackedFiles,
  sftpConfig,
  onRefreshData,
  onOpenFileModal,
}) {
  const [searchText, setSearchText] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [pushingId, setPushingId] = useState(null);
  const [convertingId, setConvertingId] = useState(null);
  const [showZipMenu, setShowZipMenu] = useState(false);

  const handleConvertStatusClick = async (fileId) => {
    if (!fileId || convertingId) return;
    setConvertingId(fileId);
    try {
      const res = await fetch("/api/convert/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || "Failed to convert file to MIR");
      }
    } catch (err) {
      alert("Error converting file: " + err.message);
    } finally {
      setConvertingId(null);
      if (onRefreshData) onRefreshData();
    }
  };

  const handlePushToSftp = async (fileId) => {
    if (!sftpConfig || sftpConfig.status !== "CONNECTED") {
      alert(
        "⚠️ No active SFTP connection.\n\nPlease go to the Connections section, enter your SFTP host/port/credentials, and click 'Test & save connection' before pushing files."
      );
      return;
    }

    setPushingId(fileId);
    try {
      const res = await fetch("/edi835/api/sftp/push/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      const data = await res.json();
      if (data.success) {
        alert("✓ " + data.message);
        if (onRefreshData) onRefreshData();
      } else {
        alert(
          "❌ " +
            (data.error ||
              "Failed to push files to SFTP server. Check server connection and credentials.")
        );
      }
    } catch (e) {
      alert("❌ Unable to reach server to push files to SFTP.");
    } finally {
      setPushingId(null);
    }
  };

  const handleDownloadMir = async (fileName, mirText, fileId) => {
    const textToDownload = mirText;
    const nameToSave = fileName || "output.mir";

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
      if (fileId) query.append("file_id", fileId);
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
      alert("Download error: " + err.message);
    }
  };

  const handleDownloadZip = async (type) => {
    setShowZipMenu(false);
    try {
      const res = await fetch(`/api/download-zip/?type=${type}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate ZIP archive");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `EDI_Archive_${type}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
    } catch (err) {
      alert("ZIP Download error: " + err.message);
    }
  };

  const handleSortHeader = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  let filtered = (trackedFiles || []).filter((item) => {
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

  filtered.sort((a, b) => {
    const mult = sortOrder === "asc" ? 1 : -1;
    if (sortKey === "date") {
      return (
        (new Date(a.uploaded_at || 0) - new Date(b.uploaded_at || 0)) * mult
      );
    }
    if (sortKey === "id") {
      return ((a.id || "").localeCompare(b.id || "")) * mult;
    }
    if (sortKey === "filename") {
      return (
        (a.original_filename || "").localeCompare(b.original_filename || "") *
        mult
      );
    }
    if (sortKey === "claims") {
      return ((a.claims_count || 0) - (b.claims_count || 0)) * mult;
    }
    if (sortKey === "status") {
      return ((a.status || "").localeCompare(b.status || "")) * mult;
    }
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);
  const startIndex = (pageIndex - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize);

  return (
    <section className="view on" id="v-archive">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <h1 style={{ margin: 0 }}>Archive</h1>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--ink-3)",
              textTransform: "uppercase",
            }}
          >
            ALL CONVERSION-SET HISTORY
          </span>
        </div>

        {/* ZIP ARCHIVE DOWNLOAD BUTTON */}
        <div style={{ position: "relative", display: "inline-block" }}>
          <button
            type="button"
            className="btn-gray"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              fontSize: "12px",
              fontWeight: 600,
              borderRadius: "6px",
              cursor: "pointer",
            }}
            onClick={() => setShowZipMenu(!showZipMenu)}
            title="Export Archive to ZIP"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 8v13H3V8"></path>
              <path d="M1 3h22v5H1z"></path>
              <path d="M10 12h4"></path>
            </svg>
            <span>ZIP Archive</span>
            <span style={{ fontSize: "10px", marginLeft: "2px" }}>▼</span>
          </button>

          {showZipMenu && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: "6px",
                background: "#ffffff",
                border: "1px solid var(--line, #e2e8f0)",
                borderRadius: "6px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                zIndex: 200,
                minWidth: "210px",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  padding: "10px 14px",
                  fontSize: "12px",
                  color: "#1e293b",
                  cursor: "pointer",
                  borderBottom: "1px solid #f1f5f9",
                  fontWeight: 500,
                }}
                onClick={() => handleDownloadZip("mir")}
              >
                Download all MIR (.mir)
              </button>
              <button
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  padding: "10px 14px",
                  fontSize: "12px",
                  color: "#1e293b",
                  cursor: "pointer",
                  borderBottom: "1px solid #f1f5f9",
                  fontWeight: 500,
                }}
                onClick={() => handleDownloadZip("835")}
              >
                Download all 835 (.x12 / .835)
              </button>
              <button
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  padding: "10px 14px",
                  fontSize: "12px",
                  color: "var(--teal, #0d9488)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                onClick={() => handleDownloadZip("both")}
              >
                Download Complete Set (.zip)
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="sub" style={{ marginTop: "4px", marginBottom: "20px" }}>
        One row represents one 835 conversion set. The 835 input(s), optional 837 reference, MIR
        output, validation result, and processing result stay together.
      </p>

      {/* 5 METRIC CARDS METRICS BAR */}
      <div
        className="metrics"
        style={{ gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "20px" }}
      >
        <div className="metric">
          <div className="v">{metrics.conversion_sets_count || 0}</div>
          <div className="l">Conversion sets</div>
          <div className="d">
            <span>{metrics.archived_files_count || 0}</span> physical file seals stored
          </div>
        </div>
        <div className="metric">
          <div className="v">{metrics.files_835_received || 0}</div>
          <div className="l">835 files received</div>
          <div className="d">Across all conversion sets</div>
        </div>
        <div className="metric">
          <div className="v">0</div>
          <div className="l">837 references</div>
          <div className="d">Optional - reference only</div>
        </div>
        <div className="metric">
          <div className="v">{metrics.validated_sets_count || 0}</div>
          <div className="l">Validated sets</div>
          <div className="d">835 validation passed</div>
        </div>
        <div className="metric">
          <div className="v">{metrics.processed_sets_count || 0}</div>
          <div className="l">Processed sets</div>
          <div className="d">
            <span>{metrics.waiting_failed_count || 0}</span> waiting/failed -{" "}
            <span>{metrics.val_failed_count || 0}</span> validation failed
          </div>
        </div>
      </div>

      {/* SEARCH BAR ROW */}
      <div
        className="filters-bar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <input
          type="text"
          placeholder="Search run, 835, 837, or MIR..."
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
          style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-3)" }}
        >
          {filtered.length} sets
        </span>
      </div>

      {/* ARCHIVE DATA TABLE */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "16px" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th
                  className={`sortable ${sortKey === "date" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("date")}
                  style={{ fontSize: "11px", letterSpacing: "0.05em" }}
                >
                  835 DATE{" "}
                  <span className="sort-arrow">
                    {sortKey === "date" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th
                  className={`sortable ${sortKey === "id" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("id")}
                  style={{ fontSize: "11px", letterSpacing: "0.05em" }}
                >
                  RUN{" "}
                  <span className="sort-arrow">
                    {sortKey === "id" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th
                  className={`sortable ${sortKey === "filename" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("filename")}
                  style={{ fontSize: "11px", letterSpacing: "0.05em" }}
                >
                  835 INPUT{" "}
                  <span className="sort-arrow">
                    {sortKey === "filename" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th style={{ fontSize: "11px", letterSpacing: "0.05em" }}>837 REF</th>
                <th style={{ fontSize: "11px", letterSpacing: "0.05em" }}>MIR OUTPUT</th>
                <th
                  className={`sortable ${sortKey === "claims" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("claims")}
                  style={{ fontSize: "11px", letterSpacing: "0.05em" }}
                >
                  CLAIMS{" "}
                  <span className="sort-arrow">
                    {sortKey === "claims" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th
                  className={`sortable ${sortKey === "sftp" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("sftp")}
                  style={{ fontSize: "11px", letterSpacing: "0.05em" }}
                >
                  IMPORT MODE{" "}
                  <span className="sort-arrow">
                    {sortKey === "sftp" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th style={{ fontSize: "11px", letterSpacing: "0.05em" }}>SFTP PUSH</th>
                <th
                  className={`sortable ${sortKey === "status" ? sortOrder : ""}`}
                  onClick={() => handleSortHeader("status")}
                  style={{ fontSize: "11px", letterSpacing: "0.05em" }}
                >
                  STATUS{" "}
                  <span className="sort-arrow">
                    {sortKey === "status" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                  </span>
                </th>
                <th style={{ fontSize: "11px", letterSpacing: "0.05em" }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td
                    colSpan="10"
                    style={{ padding: "32px", textAlign: "center", color: "var(--ink-3)" }}
                  >
                    No conversion sets match these filters.
                  </td>
                </tr>
              ) : (
                pageItems.map((f) => {
                  const upDate = f.uploaded_at ? f.uploaded_at.substring(0, 10) : "—";
                  const shortId = "R-" + f.id.substring(0, 6).toUpperCase();
                  const mirName = f.output_path
                    ? f.output_path.split("/").pop()
                    : "MIR_" +
                      (f.original_filename || "").split(",")[0].trim().replace(/\.[^/.]+$/, "") + ".mir";
                  const isProcessed = f.status === "ARCHIVED";
                  const isSftpSuccess = Boolean(f.present_in_sftp);
                  const canPushToSftp = isProcessed && !isSftpSuccess;
                  const sftpStatusText = isSftpSuccess
                    ? "Pushed"
                    : f.status === "ERROR"
                    ? "Failed"
                    : "Push to SFTP";
                  const sftpTagClass = isSftpSuccess
                    ? "ok"
                    : f.status === "ERROR"
                    ? "bad"
                    : "work";

                  let displayStatus = "";
                  if (f.status === "ARCHIVED") {
                    displayStatus = isSftpSuccess
                      ? "Validated & SFTP Success"
                      : "Validated & SFTP Pending";
                  } else if (f.status === "PROCESSING") {
                    displayStatus = "Validated & SFTP Pending";
                  } else if (f.status === "ERROR") {
                    displayStatus = "Validation Failed";
                  } else {
                    displayStatus = f.status + " & SFTP " + sftpStatusText;
                  }

                  const statusTagClass =
                    f.status === "ARCHIVED"
                      ? "ok"
                      : f.status === "ERROR"
                      ? "bad"
                      : "work";

                  let statusTitle = "";
                  if (f.status === "PROCESSING") {
                    statusTitle = "PROCESSING: 835 EDI file validated and stored in archive folder. Click to convert file into MIR.";
                  } else if (f.status === "ARCHIVED") {
                    statusTitle = "ARCHIVED: File successfully converted into MIR format and stored in archive.";
                  } else if (f.status === "ERROR") {
                    statusTitle = f.error_message
                      ? `ERROR: ${f.error_message}`
                      : "ERROR: Validation or processing failed.";
                  } else {
                    statusTitle = `${displayStatus}: Status of 835 conversion set.`;
                  }

                  const isSftpSource =
                    f.ingestion_source === "SFTP" ||
                    (f.original_filename && f.original_filename.includes(",")) ||
                    (f.input_path && f.input_path.toLowerCase().includes("sftp"));

                  const sourceLabel = isSftpSource ? "SFTP" : "MANUAL";
                  const sourceTagClass = isSftpSource ? "ok" : "work";
                  const sourceTitle = isSftpSource
                    ? "Ingested automatically from SFTP inbound folder"
                    : "Uploaded manually via conversion form";

                  return (
                    <tr key={f.id}>
                      <td className="num">{upDate}</td>
                      <td className="num" style={{ fontWeight: 600, fontSize: "11.5px" }}>
                        {shortId}
                      </td>
                      <td className="num" style={{ color: "var(--ink-2)" }}>
                        {f.original_filename}
                      </td>
                      <td className="num" style={{ color: "var(--ink-3)" }}>
                        —
                      </td>
                      <td className="num" style={{ color: "var(--ink-2)" }}>
                        {isProcessed ? mirName : "—"}
                      </td>
                      <td className="num">{f.claims_count || 0}</td>
                      <td>
                        <span
                          className={`tag ${sourceTagClass}`}
                          style={{ fontSize: "10.5px" }}
                          title={sourceTitle}
                        >
                          {sourceLabel}
                        </span>
                      </td>
                      <td>
                        {canPushToSftp ? (
                          <button
                            type="button"
                            className="tag work"
                            style={{ cursor: "pointer" }}
                            title="Upload the generated MIR file to the configured SFTP server"
                            onClick={() => handlePushToSftp(f.id)}
                            disabled={pushingId === f.id}
                          >
                            {pushingId === f.id ? "Pushing..." : "Push to SFTP"}
                          </button>
                        ) : (
                          <span
                            className={`tag ${sftpTagClass}`}
                            title={isSftpSuccess ? "MIR uploaded to the configured SFTP server." : undefined}
                          >
                            {sftpStatusText}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`tag ${statusTagClass}`}
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
                          {convertingId === f.id ? "CONVERTING..." : displayStatus}
                        </span>
                      </td>
                      <td className="num" style={{ fontSize: "11px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            minHeight: "28px",
                          }}
                        >
                          <button
                            type="button"
                            className="btn-eye"
                            title="View / Edit Code"
                            onClick={() => onOpenFileModal(f.id)}
                          >
                            <svg viewBox="0 0 24 24">
                              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                            </svg>
                          </button>
                          {isProcessed ? (
                            <button
                              type="button"
                              className="btn-download"
                              title="Download .mir File"
                              onClick={() => handleDownloadMir(mirName, f.mir_text, f.id)}
                            >
                              <svg viewBox="0 0 24 24">
                                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                              </svg>
                            </button>
                          ) : (
                            "—"
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROL FOOTER */}
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
              <option value="100">100</option>
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

      {/* FOOTER SUBTEXT LEGEND */}
      <div
        style={{
          fontSize: "11.5px",
          color: "var(--teal)",
          fontWeight: 500,
          display: "flex",
          gap: "24px",
        }}
      >
        <span>&#9632; Archive table = one row per conversion set</span>
        <span>&#9632; Physical 835 / 837 / MIR file hashes remain stored individually</span>
      </div>
    </section>
  );
}
