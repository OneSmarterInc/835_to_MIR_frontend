const DOWNLOAD_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 18v2h14v-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function x12ClaimRows(content, claimTag) {
  const source = String(content || "");
  const delimiter = source.startsWith("ISA") && source.length > 105 ? source[105] : "~";
  const segments = source.split(delimiter).map((segment) => segment.trim()).filter(Boolean);
  const rows = [];
  let claim = [];

  const flush = () => {
    if (!claim.length) return;
    rows.push(`${claim.join(delimiter)}${delimiter}`);
    claim = [];
  };

  segments.forEach((segment) => {
    const tag = segment.split("*", 1)[0].toUpperCase();
    if (tag === claimTag) {
      flush();
      claim = [segment];
      return;
    }
    if (claim.length) claim.push(segment);
  });
  flush();
  return rows;
}

function candidateRows(data) {
  const type = String(data?.type || "").toUpperCase();
  const content = String(data?.content || "").replace(/\r\n?/g, "\n");

  if (type === "835") return x12ClaimRows(content, "CLP");
  if (type === "837") return x12ClaimRows(content, "CLM");
  if (type === "MIR") {
    const physicalRows = content.split("\n").filter((row) => row.trim());
    if (physicalRows.length > 1) return physicalRows;
    return content.split(/(?=HI\d{15,})/).filter((row) => row.trim());
  }
  if (type === "RECON") return content.split("\n").filter((row) => row.trim());

  return Array.isArray(data?.claim_rows) ? data.claim_rows : content.split("\n");
}

function claimIdentifiers(viewer, claimNumber) {
  const values = [String(claimNumber || "").trim()];
  viewer.querySelectorAll(".mpl-file-viewer-toolbar dt").forEach((term) => {
    if (!/internal claim number/i.test(term.textContent || "")) return;
    const text = term.parentElement?.querySelector("dd")?.textContent || "";
    text.split(",").map((value) => value.trim()).filter(Boolean).forEach((value) => values.push(value));
  });
  return [...new Set(values.filter((value) => value && value.toLowerCase() !== "not found"))];
}

function matchingRows(data, identifiers) {
  const upperIdentifiers = identifiers.map((value) => value.toUpperCase());
  const matches = candidateRows(data).filter((row) => {
    const upper = String(row || "").toUpperCase();
    return upperIdentifiers.some((identifier) => upper.includes(identifier));
  });
  if (matches.length) return matches;

  const databaseRows = Array.isArray(data?.claim_rows) ? data.claim_rows.filter(Boolean) : [];
  const databaseMatches = databaseRows.filter((row) => {
    const upper = String(row || "").toUpperCase();
    return upperIdentifiers.some((identifier) => upper.includes(identifier));
  });
  if (databaseMatches.length) return databaseMatches;

  // Safe fallback for a file that contains exactly one normalized claim.
  return databaseRows.length === 1 ? databaseRows : [];
}

function slicedFilename(filename, claimNumber) {
  const source = String(filename || "claim-file.txt");
  const dot = source.lastIndexOf(".");
  const base = dot > 0 ? source.slice(0, dot) : source;
  const extension = dot > 0 ? source.slice(dot) : ".txt";
  const safeClaim = String(claimNumber || "claim").replace(/[^A-Za-z0-9_-]+/g, "_");
  return `${base}_sliced_claim_${safeClaim}${extension}`;
}

function showMessage(toolbar, text) {
  let message = toolbar.querySelector(".mpl-claim-slice-message");
  if (!message) {
    message = document.createElement("span");
    message.className = "mpl-claim-slice-message";
    toolbar.appendChild(message);
  }
  message.textContent = text;
  window.setTimeout(() => message.remove(), 3200);
}

async function downloadClaimSlice(button) {
  const viewer = button.closest(".mpl-file-viewer");
  const toolbar = button.closest(".mpl-file-viewer-toolbar");
  if (!viewer || !toolbar) return;

  const title = viewer.querySelector("#mpl-file-viewer-title")?.textContent || "";
  const claimMatch = title.match(/Highmark claim\s+(.+)$/i);
  const claimNumber = claimMatch?.[1]?.trim() || "";
  const sourceLink = toolbar.querySelector("a.mpl-btn.primary[href]");
  if (!claimNumber || !sourceLink) {
    showMessage(toolbar, "Unable to identify the claim file.");
    return;
  }

  const sourceUrl = sourceLink.getAttribute("href") || "";
  const viewUrl = `${sourceUrl}${sourceUrl.includes("?") ? "&" : "?"}view=1`;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");

  try {
    const response = await window.fetch(viewUrl, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || "Unable to read the source file.");

    const identifiers = claimIdentifiers(viewer, claimNumber);
    const rows = matchingRows(data, identifiers);
    if (!rows.length) {
      showMessage(toolbar, "No matching claim record was found in this file.");
      return;
    }

    const output = `${rows.map((row) => String(row).trim()).filter(Boolean).join("\n")}\n`;
    const blob = new Blob([output], { type: "application/octet-stream" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = slicedFilename(data.filename, claimNumber);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1500);
  } catch (error) {
    showMessage(toolbar, error?.message || "Unable to create the sliced claim file.");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function enhanceViewer(viewer) {
  const toolbar = viewer.querySelector(".mpl-file-viewer-toolbar");
  if (!toolbar || toolbar.querySelector(".mpl-claim-slice-download")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "mpl-claim-slice-download";
  button.setAttribute("aria-label", "Download sliced claims");
  button.title = "Download sliced claims";
  button.innerHTML = DOWNLOAD_ICON;
  button.addEventListener("click", () => downloadClaimSlice(button));
  toolbar.appendChild(button);
}

export function installClaimSliceDownload() {
  const refresh = () => document.querySelectorAll(".mpl-file-viewer").forEach(enhanceViewer);
  refresh();
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}
