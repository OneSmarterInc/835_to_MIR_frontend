import React, { useEffect, useMemo, useState } from "react";
import { portalFetch } from "../utils/api";
import SftpBrowserModal from "./SftpBrowserModal";
import "./SftpConfigurationPanel.css";

const NAV = ["DEFAULT", "837", "835", "MIR", "RECON"];
const ROUTES = {
  "837": [{ key: "837_IN", label: "Inbound" }, { key: "837_OUT", label: "Outbound" }],
  "835": [{ key: "835_IN", label: "Inbound" }, { key: "835_OUT", label: "Outbound" }],
  MIR: [{ key: "MIR_OUT", label: "Outbound" }],
  RECON: [{ key: "RECON_IN", label: "Inbound" }],
};
const PATHS = [
  ["837_IN", "837 Inbound"], ["837_OUT", "837 Outbound"],
  ["835_IN", "835 Inbound"], ["835_OUT", "835 Outbound"],
  ["MIR_OUT", "MIR Outbound"], ["RECON_IN", "RECON Inbound"],
];
const blank = (purpose) => ({ purpose, id: "", host: "", port: "22", username: "", password: "", ssh_key: "", auth_method: "Password", trust_unknown_key: true, remote_folder: "", use_default: purpose !== "DEFAULT", setup_all_paths: true, route_paths: {}, has_password: false, has_ssh_key: false, status: "NOT_CONFIGURED" });

export default function SftpConfigurationPanel({ clientId = null, onConfigured, compact = false }) {
  const [section, setSection] = useState("DEFAULT");
  const [direction, setDirection] = useState("837_IN");
  const [configs, setConfigs] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [browser, setBrowser] = useState(null);

  const query = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
  const load = async () => {
    setLoading(true);
    try {
      const response = await portalFetch(`/edi835/api/sftp/get/${query}`);
      const data = await response.json();
      if (!response.ok || data.success === false) throw new Error(data.error || "Unable to load SFTP settings.");
      const next = {};
      (data.configurations || []).slice().reverse().forEach((item) => { next[item.purpose || "DEFAULT"] = { ...blank(item.purpose || "DEFAULT"), ...item, password: "", ssh_key: "", port: String(item.port || 22) }; });
      setConfigs(next);
    } catch (error) { setMessage({ tone: "error", text: error.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const purpose = section === "DEFAULT" ? "DEFAULT" : direction;
  const form = useMemo(() => ({ ...blank(purpose), ...(configs[purpose] || {}) }), [configs, purpose]);
  const defaultConfig = useMemo(() => ({ ...blank("DEFAULT"), ...(configs.DEFAULT || {}) }), [configs]);
  const change = (field, value) => setConfigs((old) => ({ ...old, [purpose]: { ...blank(purpose), ...(old[purpose] || {}), [field]: value } }));
  const changePath = (key, value) => setConfigs((old) => {
    const current = { ...blank("DEFAULT"), ...(old.DEFAULT || {}) };
    return { ...old, DEFAULT: { ...current, route_paths: { ...(current.route_paths || {}), [key]: value } } };
  });
  const selectSection = (next) => { setSection(next); if (next !== "DEFAULT") setDirection(ROUTES[next][0].key); setMessage(null); };

  const save = async ({ testOnly = false, pathsOnly = false } = {}) => {
    setBusy(true); setMessage(null);
    try {
      const payload = { ...form, client_id: clientId || undefined, test_only: testOnly, save_paths_only: pathsOnly };
      const response = await portalFetch("/edi835/api/sftp/save/", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok || data.success === false) throw new Error(data.error || "SFTP configuration could not be saved.");
      if (!testOnly) {
        setConfigs((old) => ({ ...old, [purpose]: { ...form, id: data.config_id || form.id, password: "", ssh_key: "", has_password: form.has_password || Boolean(form.password), has_ssh_key: form.has_ssh_key || Boolean(form.ssh_key), status: data.status || "CONNECTED" } }));
        onConfigured?.(data);
      }
      setMessage({ tone: "success", text: testOnly ? "Connection successful." : pathsOnly ? "Path saved successfully." : "Connection verified and saved." });
    } catch (error) { setMessage({ tone: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  const browse = (path, onSelect) => {
    if (!form.id) return setMessage({ tone: "error", text: "Connect and save this SFTP server before browsing its folders." });
    setBrowser({ configId: form.id, initialPath: path || ".", onSelectFolder: (value) => { onSelect(value); setBrowser(null); } });
  };

  const connectionFields = !form.use_default && <>
    <div className="sftp-pro-grid">
      <label><span>Host</span><input value={form.host || ""} onChange={(e) => change("host", e.target.value)} placeholder="sftp.example.com" /></label>
      <label className="port"><span>Port</span><input value={form.port || "22"} onChange={(e) => change("port", e.target.value)} inputMode="numeric" /></label>
      <label><span>Username</span><input value={form.username || ""} onChange={(e) => change("username", e.target.value)} autoComplete="off" /></label>
      <label><span>Authentication</span><select value={form.auth_method || "Password"} onChange={(e) => change("auth_method", e.target.value)}><option>Password</option><option>SSH Key</option><option>SSH Key + Password</option></select></label>
    </div>
    {(form.auth_method === "Password" || form.auth_method === "SSH Key + Password") && <label className="sftp-pro-field"><span>Password / Key passphrase</span><input type="password" value={form.password || ""} onChange={(e) => change("password", e.target.value)} placeholder={form.has_password ? "Saved — enter a new password to replace" : "Enter password"} autoComplete="new-password" /></label>}
    {(form.auth_method === "SSH Key" || form.auth_method === "SSH Key + Password") && <label className="sftp-pro-field"><span>SSH private key</span><textarea rows="5" value={form.ssh_key || ""} onChange={(e) => change("ssh_key", e.target.value)} placeholder={form.has_ssh_key ? "Saved — paste a new private key to replace" : "Paste the private key"} /></label>}
    <label className="sftp-pro-check"><input type="checkbox" checked={form.trust_unknown_key !== false} onChange={(e) => change("trust_unknown_key", e.target.checked)} /><span>Trust unknown host key</span></label>
    <div className="sftp-pro-actions"><button className="btn primary" type="button" disabled={busy} onClick={() => save()}>{busy ? "Connecting…" : "Connect & Save"}</button></div>
  </>;

  return <div className={`sftp-pro ${compact ? "compact" : ""}`}>
    <aside className="sftp-pro-nav" aria-label="SFTP configuration sections">{NAV.map((item) => <button type="button" key={item} className={section === item ? "active" : ""} onClick={() => selectSection(item)}><span className="dot" />{item === "DEFAULT" ? "Default" : item}</button>)}</aside>
    <main className="sftp-pro-main">
      {loading ? <div className="sftp-pro-loading">Loading SFTP configuration…</div> : <>
        <header><div><div className="eyebrow">SECURE FILE TRANSFER</div><h2>{section === "DEFAULT" ? "Default SFTP connection" : `${section} transfer`}</h2><p>{section === "DEFAULT" ? "Use one verified server for all selected transfer paths." : "Use the default server or configure a dedicated server for this direction."}</p></div><span className={`sftp-pro-status ${form.status === "CONNECTED" ? "ok" : ""}`}>{form.status === "CONNECTED" ? "Connected" : "Not configured"}</span></header>
        {section !== "DEFAULT" && <div className="sftp-pro-tabs">{ROUTES[section].map((route) => <button type="button" key={route.key} className={direction === route.key ? "active" : ""} onClick={() => setDirection(route.key)}>{route.label}</button>)}</div>}
        {section !== "DEFAULT" && <label className="sftp-pro-default"><input type="checkbox" checked={form.use_default !== false} onChange={(e) => change("use_default", e.target.checked)} /><span><b>Use Default SFTP connection</b><small>Credentials and this route’s path are inherited from Default.</small></span></label>}
        {section !== "DEFAULT" && form.use_default !== false && <label className="sftp-pro-path inherited"><span>Inherited {ROUTES[section].find((r) => r.key === direction)?.label} folder</span><div><input value={(defaultConfig.route_paths || {})[direction] || ""} readOnly placeholder="Configure this path under Default" /><button type="button" title="Browse inherited folder" disabled={!defaultConfig.id} onClick={() => setBrowser({ configId: defaultConfig.id, initialPath: (defaultConfig.route_paths || {})[direction] || ".", onSelectFolder: () => setBrowser(null) })}>⌑</button></div><small>This value is managed in the Default section.</small></label>}
        {connectionFields}
        {section === "DEFAULT" && <label className="sftp-pro-default paths"><input type="checkbox" checked={form.setup_all_paths !== false} onChange={(e) => change("setup_all_paths", e.target.checked)} /><span><b>Set up all paths on the same SFTP</b><small>Configure every inbound and outbound folder on this server.</small></span></label>}
        {section === "DEFAULT" && form.setup_all_paths !== false && <div className="sftp-pro-paths">{PATHS.map(([key, label]) => <label key={key}><span>{label}</span><div><input value={(form.route_paths || {})[key] || ""} onChange={(e) => changePath(key, e.target.value)} placeholder={`/${key.toLowerCase().replace("_", "/")}`} /><button type="button" title={`Browse ${label} folder`} onClick={() => browse((form.route_paths || {})[key], (value) => changePath(key, value))}>⌑</button></div></label>)}</div>}
        {section !== "DEFAULT" && form.use_default === false && <label className="sftp-pro-path"><span>{ROUTES[section].find((r) => r.key === direction)?.label} folder</span><div><input value={form.remote_folder || ""} onChange={(e) => change("remote_folder", e.target.value)} placeholder="/remote/folder" /><button type="button" title="Browse remote folder" onClick={() => browse(form.remote_folder, (value) => change("remote_folder", value))}>⌑</button></div></label>}
        {(section === "DEFAULT" ? form.setup_all_paths !== false : true) && <div className="sftp-pro-actions footer"><button type="button" className="btn primary" disabled={busy} onClick={() => save({ pathsOnly: true })}>{busy ? "Saving…" : section === "DEFAULT" ? "Save Paths" : form.use_default !== false ? "Save Default Assignment" : "Save Path"}</button></div>}
        {message && <div className={`sftp-pro-message ${message.tone}`}>{message.text}</div>}
      </>}
    </main>
    {browser && <SftpBrowserModal isOpen {...browser} onClose={() => setBrowser(null)} />}
  </div>;
}
