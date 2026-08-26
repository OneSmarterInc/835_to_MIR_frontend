import React, { useState, useEffect, useRef } from "react";

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem("onesmarter_admin_token");
  const headers = { ...extra };
  if (token) headers.Authorization = `Token ${token}`;
  return headers;
}

export default function SftpBrowserModal({
  isOpen,
  initialPath,
  configId,
  onSelectFolder,
  onClose,
}) {
  const [currentPath, setCurrentPath] = useState(initialPath || ".");
  const [navHistory, setNavHistory] = useState([initialPath || "."]);
  const [navIndex, setNavIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [parentPath, setParentPath] = useState(null);
  const cacheRef = useRef({});

  useEffect(() => {
    if (!isOpen) return;

    cacheRef.current = {};
    const p = initialPath?.trim() || ".";
    setCurrentPath(p);
    setNavHistory([p]);
    setNavIndex(0);
    fetchDirectory(p, false);
  }, [isOpen, initialPath, configId]);

  if (!isOpen) return null;

  const fetchDirectory = async (targetPath, recordHistory = true) => {
    const normalizedConfigId = String(configId ?? "").trim();
    const p = targetPath?.trim() || ".";

    if (!normalizedConfigId) {
      setError("SFTP configuration ID is unavailable. Save the SFTP configuration first.");
      setFolders([]);
      setFiles([]);
      setParentPath(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (cacheRef.current[p]) {
      const cached = cacheRef.current[p];
      setCurrentPath(cached.pwd || p);
      setFolders(cached.folders || []);
      setFiles(cached.files || []);
      setParentPath(cached.parent_path);
      setLoading(false);
      return;
    }

    try {
      const payload = { config_id: normalizedConfigId, path: p };

      const res = await fetch("/edi835/api/sftp/browse/", {
        method: "POST",
        headers: getAuthHeaders({
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Server returned a non-JSON response (${res.status}).`);
      }

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || data.detail || `Failed to list directory (${res.status}).`);
      }

      const resolvedPwd = data.pwd || p;
      setCurrentPath(resolvedPwd);
      setFolders(Array.isArray(data.folders) ? data.folders : []);
      setFiles(Array.isArray(data.files) ? data.files : []);
      setParentPath(data.parent_path || null);

      if (recordHistory) {
        setNavHistory((prev) => {
          const next = prev.slice(0, navIndex + 1);
          next.push(resolvedPwd);
          return next;
        });
        setNavIndex((prev) => prev + 1);
      }

      cacheRef.current[p] = data;
      cacheRef.current[resolvedPwd] = data;
    } catch (err) {
      setError(err.message || "Unable to browse the SFTP directory.");
      setFolders([]);
      setFiles([]);
      setParentPath(null);
    } finally {
      setLoading(false);
    }
  };


  const navigateBack = () => {
    if (navIndex > 0) {
      const target = navHistory[navIndex - 1];
      setNavIndex(navIndex - 1);
      fetchDirectory(target, false);
    }
  };

  const navigateForward = () => {
    if (navIndex < navHistory.length - 1) {
      const target = navHistory[navIndex + 1];
      setNavIndex(navIndex + 1);
      fetchDirectory(target, false);
    }
  };

  const navigateUp = () => {
    if (!currentPath || currentPath === "/" || currentPath === ".") return;
    const parts = currentPath.replace(/\/$/, "").split("/");
    parts.pop();
    const parent = parts.join("/") || "/";
    fetchDirectory(parent, true);
  };

  return (
    <div id="sftpBrowserModal" className="inline-viewer-modal">
      <div
        className="inline-viewer-content"
        style={{ width: "90vw", maxWidth: "1200px", height: "85vh" }}
      >
        <div className="inline-viewer-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--teal)"
              strokeWidth="2"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
              Remote SFTP Directory Browser
            </h3>
            <span className="tag ok" style={{ fontSize: "10px" }}>
              SFTP DIRECTORY
            </span>
          </div>
          <button
            type="button"
            className="modal-cross-btn"
            title="Close SFTP Browser"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div
          className="inline-viewer-body"
          style={{ padding: "16px", overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
          {/* Breadcrumb & Nav Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
              background: "#F4F6F8",
              padding: "8px 12px",
              border: "1px solid var(--line)",
              borderRadius: "4px",
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "var(--display)",
                fontSize: "12px",
              }}
            >
              <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>Path:</span>
              <input
                type="text"
                value={currentPath}
                onChange={(e) => setCurrentPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    fetchDirectory(currentPath, true);
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: "250px",
                  padding: "4px 8px",
                  fontSize: "12px",
                  fontFamily: "var(--display)",
                  border: "1px solid var(--line)",
                  borderRadius: "4px",
                }}
              />

              <button
                type="button"
                className="btn primary"
                style={{ padding: "4px 12px", fontSize: "11px" }}
                onClick={() => fetchDirectory(currentPath, true)}
              >
                Go
              </button>
            </div>
          </div>

          {/* Directory listing table */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              border: "1px solid var(--line)",
              borderRadius: "4px",
              background: "var(--surface)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ fontSize: "10px", width: "45%" }}>NAME</th>
                  <th style={{ fontSize: "10px", width: "15%" }}>TYPE</th>
                  <th style={{ fontSize: "10px", width: "15%" }}>SIZE</th>
                  <th style={{ fontSize: "10px", width: "25%" }}>LAST MODIFIED</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan="4"
                      style={{ padding: "20px", textAlign: "center", color: "var(--ink-3)" }}
                    >
                      Loading SFTP directory contents...
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td
                      colSpan="4"
                      style={{
                        padding: "20px",
                        textAlign: "center",
                        color: "var(--brick)",
                        fontWeight: 600,
                      }}
                    >
                      ✕ {error}
                    </td>
                  </tr>
                )}
                {!loading && !error && folders.length === 0 && files.length === 0 && !parentPath && (
                  <tr>
                    <td
                      colSpan="4"
                      style={{ padding: "20px", textAlign: "center", color: "var(--ink-3)" }}
                    >
                      Directory is empty.
                    </td>
                  </tr>
                )}
                {!loading && !error && parentPath && (
                  <tr
                    style={{ cursor: "pointer", background: "#F8FAFC" }}
                    onClick={() => fetchDirectory(parentPath, true)}
                  >
                    <td style={{ fontWeight: 600, color: "var(--teal)" }}>
                      📁 .. (Parent Directory)
                    </td>
                    <td style={{ color: "var(--ink-3)", fontSize: "11px" }}>Folder</td>
                    <td style={{ color: "var(--ink-3)", fontSize: "11px" }}>—</td>
                    <td style={{ color: "var(--ink-3)", fontSize: "11px" }}>—</td>
                  </tr>
                )}
                {!loading &&
                  !error &&
                  folders.map((f, idx) => (
                    <tr
                      key={idx}
                      style={{ cursor: "pointer" }}
                      onClick={() => fetchDirectory(f.path, true)}
                    >
                      <td style={{ fontWeight: 600, color: "var(--ink-1)" }}>📁 {f.name}</td>
                      <td>
                        <span className="tag ok" style={{ fontSize: "9.5px" }}>
                          FOLDER
                        </span>
                      </td>
                      <td style={{ color: "var(--ink-3)", fontSize: "11px" }}>—</td>
                      <td style={{ color: "var(--ink-3)", fontSize: "11px" }}>{f.mtime}</td>
                    </tr>
                  ))}
                {!loading &&
                  !error &&
                  files.map((file, idx) => (
                    <tr key={idx}>
                      <td style={{ color: "var(--ink-2)" }}>📄 {file.name}</td>
                      <td>
                        <span className="tag idle" style={{ fontSize: "9.5px" }}>
                          FILE
                        </span>
                      </td>
                      <td className="num" style={{ fontSize: "11px" }}>
                        {file.size} B
                      </td>
                      <td style={{ color: "var(--ink-3)", fontSize: "11px" }}>{file.mtime}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="inline-viewer-footer">
          <button
            type="button"
            className="btn primary"
            style={{ padding: "6px 16px", fontSize: "12px" }}
            onClick={() => {
              onSelectFolder(currentPath);
              onClose();
            }}
            disabled={loading || Boolean(error) || !configId}
          >
            Select This Folder
          </button>
          <button
            type="button"
            className="btn secondary"
            style={{ padding: "6px 16px", fontSize: "12px" }}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
