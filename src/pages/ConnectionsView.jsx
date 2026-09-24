import React from "react";
import SftpConfigurationPanel from "../components/SftpConfigurationPanel";
import WorkspaceHeader from "../components/WorkspaceHeader";

export default function ConnectionsView({ onRefreshSftp }) {
  return <section className="view on">
    <WorkspaceHeader eyebrow="Connections workspace" title="SFTP Configuration" description="Configure one shared SFTP server or dedicated servers for each transfer operation." />
    <div style={{ marginTop: 18 }}><SftpConfigurationPanel onConfigured={onRefreshSftp} /></div>
  </section>;
}
