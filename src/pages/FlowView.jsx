import React, { useEffect, useState } from "react";
import TimeDisplay from "../components/TimeDisplay";
import WorkspaceHeader from "../components/WorkspaceHeader";
import { withCsrf } from "../utils/api";

export default function FlowView({
  metrics,
  recentFiles,
  inboundConfig,
  outboundConfig
}) {
  const todayDateStr = new Date().toISOString().substring(0, 10);
  const [health, setHealth] = useState({ inbound: { state: "checking" }, outbound: { state: "checking" } });
  useEffect(() => {
    let active = true;
    const check = async direction => {
      const config = direction === "inbound" ? inboundConfig : outboundConfig;
      if (!config?.id) return { state: "unconfigured", label: "Not configured" };
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 18000);
      try {
        const response = await fetch("/edi835/api/sftp/connect/", withCsrf({
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config_id: config.id, direction }), signal: abort.signal,
        }));
        const result = await response.json();
        if (result.success === true) return { state: "connected", label: "Connected — live test passed", checkedAt: new Date() };
        const type = String(result.error_type || "").toUpperCase();
        const label = type.includes("AUTH") || /password|authentication|credential/i.test(result.error || "")
          ? "Authentication failed"
          : type.includes("TCP") || type.includes("NETWORK") ? "Server unreachable"
          : type.includes("HOST_KEY") ? "Host key verification failed"
          : "Connection failed";
        return { state: "failed", label, detail: String(result.error || "").slice(0, 180), checkedAt: new Date() };
      } catch (error) {
        return { state: "failed", label: error.name === "AbortError" ? "Connection timed out" : "Connection check unavailable", checkedAt: new Date() };
      } finally { clearTimeout(timeout); }
    };
    const refresh = async () => {
      if (!active || document.visibilityState === "hidden") return;
      setHealth({ inbound: { state: "checking", label: "Checking connection…" },
        outbound: { state: "checking", label: "Checking connection…" } });
      const [inbound, outbound] = await Promise.all([check("inbound"), check("outbound")]);
      if (active) setHealth({ inbound, outbound });
    };
    refresh();
    const interval = setInterval(refresh, 60000);
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [inboundConfig?.id, outboundConfig?.id]);
  const inboundHealth = health.inbound;
  const outboundHealth = health.outbound;

  return (
    <section className="view on" id="v-flow">
      <WorkspaceHeader eyebrow={`Flow workspace · ${todayDateStr}`} title="Flow" description="837 is optional reference only. MIR is built from validated 835 files using the active mapping, then prepared for the configured delivery path." />

      {/* DYNAMIC PIPELINE TRACK */}
      <div className="pipe">
        <div className="pipe-track">
          {/* STAGE 01 */}
          <div className="stage">
            <div className="n">01</div>
            <h3>837 reference</h3>
            <div className="who">Optional - reference only</div>
            <div className="chipstack">
              <div className="chip idle">
                <span>No 837 reference today</span>
                <span className="c">optional</span>
              </div>
            </div>
          </div>

          {/* STAGE 02 */}
          <div className="stage">
            <div className="n">02</div>
            <h3>835 received</h3>
            <div className="who">Source used to build MIR</div>
            <div className="chipstack" id="stage2Chips">
              {recentFiles && recentFiles.length > 0 ? (
                recentFiles.map((f, idx) => (
                  <div
                    key={idx}
                    className={`chip ${
                      f.status === "ARCHIVED"
                        ? "ok"
                        : f.status === "PROCESSING"
                        ? "work"
                        : "hold"
                    }`}
                  >
                    <span title={f.original_filename}>
                      {(f.original_filename || "").substring(0, 24)}
                    </span>
                    <span className="c">{f.claims_count || 0} clm</span>
                  </div>
                ))
              ) : (
                <div className="chip idle">
                  <span>No 835 received today</span>
                  <span className="c">&ndash;</span>
                </div>
              )}
            </div>
          </div>

          {/* STAGE 03 */}
          <div className="stage">
            <div className="n">03</div>
            <h3>MIR built</h3>
            <div className="who">Relay conversion</div>
            <div className="chipstack" id="stage3Chips">
              {recentFiles &&
              recentFiles.filter(
                (f) =>
                  (f.status === "ARCHIVED" || f.status === "COMPLETED") &&
                  f.mir_filename
              ).length > 0 ? (
                recentFiles
                  .filter(
                    (f) =>
                      (f.status === "ARCHIVED" || f.status === "COMPLETED") &&
                      f.mir_filename
                  )
                  .map((f, idx) => {
                    const mirName = f.mir_filename;

                    return (
                      <div key={idx} className="chip ok">
                        <span title={mirName}>
                          {mirName.length > 24
                            ? `${mirName.substring(0, 24)}...`
                            : mirName}
                        </span>

                        <span className="c">
                          {`${f.records_count || f.claims_count || 0} rec`}
                        </span>
                      </div>
                    );
                  })
              ) : (
                <div className="chip idle">
                  <span>No MIR built today</span>
                  <span className="c">&ndash;</span>
                </div>
              )}
            </div>
          </div>

          {/* STAGE 04 */}
          <div className="stage">
            <div className="n">04</div>
            <h3>MIR delivery path</h3>
            <div className="who">Configured outbound SFTP</div>
            <div className="chipstack" id="stage4Chips">
              {outboundHealth.state === "connected" ? (
                <div className="chip ok">
                  <span>MIR folder configured</span>
                  <span className="c">SFTP ready</span>
                </div>
              ) : (
                <div className="chip idle">
                  <span>SFTP not connected</span>
                  <span className="c">setup</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* METRICS GRID */}
      <div className="metrics">
        <div className="metric">
          <div className="v" id="metricClaimsConvertedCount">
            {metrics.total_claims_converted_today || 0}
          </div>
          <div className="l">Claims converted today</div>
          <div className="d">
            <span id="metricCompletedRunsCount">
              {metrics.converted_today_file_count || 0}
            </span>{" "}
            completed runs
          </div>
        </div>
        <div className="metric">
          <div className="v" id="metricValidatedWaitingCount">
            {metrics.validated_waiting_count || 0}
          </div>
          <div className="l">Validated, waiting</div>
          <div className="d">Ready for Process MIR</div>
        </div>
        <div className="metric">
          <div
            className="v"
            id="metricRunsAttentionCount"
            style={{
              color: metrics.runs_needing_attention_count > 0 ? "var(--brick)" : "inherit",
            }}
          >
            {metrics.runs_needing_attention_count || 0}
          </div>
          <div className="l">Runs needing attention</div>
          <div className="d">Validation or processing failed</div>
        </div>
        <div className="metric">
          <div className="v" id="metricMirOutputsCount">
            {metrics.mir_outputs_today_count || 0}
          </div>
          <div className="l">MIR outputs today</div>
          <div className="d">0 optional 837 references</div>
        </div>
      </div>

      {/* INBOUND & OUTBOUND SFTP CARDS */}
      <div className="cols" style={{ gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div className="card" style={{ padding: "20px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>
            Inbound SFTP
          </h2>
          <div className="eyebrow" style={{ marginBottom: "12px" }}>
            835 FROM CLAIMS SYSTEM &bull; 837 OPTIONAL REFERENCE
          </div>
          <div
            id="flowInboundBanner"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "4px",
              padding: "8px 12px",
              fontWeight: 600,
              fontSize: "13px",
              color:
                inboundHealth.state === "connected"
                  ? "var(--teal)"
                  : "var(--ink-2)",
              marginBottom: "14px",
            }}
          >
            {inboundConfig && inboundConfig.host
              ? `${inboundHealth.label || "Checking connection…"} (${inboundConfig.host})`
              : "Not configured"}
          </div>
          <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="k">Host</span>
            <span className="v" id="flowInboundHost" style={{ color: "var(--ink-3)" }}>
              {inboundConfig ? `${inboundConfig.host}:${inboundConfig.port || 22}` : "–"}
            </span>
          </div>
          <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="k">835 folder</span>
            <span className="v" id="flowInbound835Dir" style={{ color: "var(--ink-3)" }}>
              {inboundConfig ? inboundConfig.inbound_835_folder || "–" : "–"}
            </span>
          </div>
          <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="k">837 reference folder</span>
            <span className="v" id="flowInbound837Dir" style={{ color: "var(--ink-3)" }}>
              {inboundConfig ? inboundConfig.inbound_837_folder || "–" : "–"}
            </span>
          </div>
          <div className="kv" style={{ padding: "8px 0" }}>
            <span className="k">Connection</span>
            <span
              className="v"
              id="flowInboundConnection"
              style={{
                color:
                  inboundHealth.state === "connected"
                    ? "var(--teal)"
                    : inboundHealth.state === "failed"
                    ? "var(--brick)"
                    : "var(--ink-3)",
                fontWeight: 500,
              }}
            >
              {inboundConfig ? inboundHealth.label || "Checking…" : "Not configured"}
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: "20px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>
            Outbound SFTP
          </h2>
          <div className="eyebrow" style={{ marginBottom: "12px" }}>
            MIR DESTINATION FOR MPL
          </div>
          <div
            id="flowOutboundBanner"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "4px",
              padding: "8px 12px",
              fontWeight: 600,
              fontSize: "13px",
              color:
                outboundHealth.state === "connected"
                  ? "var(--teal)"
                  : "var(--ink-2)",
              marginBottom: "14px",
            }}
          >
            {outboundConfig && outboundConfig.host
              ? `${outboundHealth.label || "Checking connection…"} (${outboundConfig.host})`
              : "Not configured"}
          </div>
          <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="k">MIR folder</span>
            <span className="v" id="flowOutboundMirDir" style={{ color: "var(--ink-3)" }}>
              {outboundConfig ? outboundConfig.outbound_mir_folder || "–" : "–"}
            </span>
          </div>
          <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="k">MIR built today</span>
            <span className="v" id="flowMirBuiltCount" style={{ fontWeight: 600 }}>
              {metrics.mir_outputs_today_count || 0}
            </span>
          </div>
          <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="k">Last connection test (EST)</span>
            <span className="v" id="flowOutboundLastTest" style={{ color: "var(--ink-3)" }}>
              {outboundHealth.checkedAt ? <TimeDisplay value={outboundHealth.checkedAt} easternOnly /> : "–"}
            </span>
          </div>
          <div className="kv" style={{ padding: "8px 0" }}>
            <span className="k">Folders discovered</span>
            <span className="v" id="flowOutboundFoldersDiscovered" style={{ fontWeight: 600 }}>
              {outboundConfig
                ? (outboundConfig.inbound_835_folder ? 1 : 0) +
                  (outboundConfig.inbound_837_folder ? 1 : 0) +
                  (outboundConfig.outbound_mir_folder ? 1 : 0)
                : 0}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
