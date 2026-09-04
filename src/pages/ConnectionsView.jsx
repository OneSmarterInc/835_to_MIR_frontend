import React from "react";
import SftpConfigurationPanel from "../components/SftpConfigurationPanel";

export default function ConnectionsView({ onRefreshSftp }) {
  return <section className="view on">
    <div className="hdr-row"><div><div className="eyebrow">Connections</div><h1 style={{ margin: 0 }}>SFTP Configuration</h1><p className="sub">Configure one shared SFTP server or dedicated servers for each transfer operation.</p></div></div>
    <div style={{ marginTop: 18 }}><SftpConfigurationPanel onConfigured={onRefreshSftp} /></div>
  </section>;
}
