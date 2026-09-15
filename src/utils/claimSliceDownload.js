const DOWNLOAD_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M12 3v10m0 0 4-4m-4 4-4-4M5 16.5v3h14v-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const INTERNAL_EXACT = /^[A-Z]{3}\d{3}$/i;
const INTERNAL_PACKED = /^([A-Z]{3}\d{3})(?=\d{4,})/i;

function normalizeInternalClaimNumber(value, claimNumber = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const highmark = String(claimNumber || "").trim();

  if (highmark) {
    const packedAfterClaim = raw.match(
      new RegExp(`(?:HI)?${highmark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^A-Z0-9]*([A-Z]{3}\\d{3})`, "i"),
    );
    if (packedAfterClaim) return packedAfterClaim[1].toUpperCase();
  }

  if (INTERNAL_EXACT.test(raw)) return raw.toUpperCase();
  const packed = raw.match(INTERNAL_PACKED);
  if (packed) return packed[1].toUpperCase();
  return raw;
}

function claimIdentifiers(viewer, claimNumber) {
  const values = [String(claimNumber || "").trim()];
  viewer.querySelectorAll(".mpl-file-viewer-toolbar dt").forEach((term) => {
    if (!/internal claim number/i.test(term.textContent || "")) return;
    const text = term.parentElement?.querySelector("dd")?.textContent || "";
    text.split(",").map((value) => value.trim()).filter(Boolean).forEach((value) => {
      const normalized = normalizeInternalClaimNumber(value, claimNumber);
      if (normalized) values.push(normalized);
    });
  });
  return [...new Set(values.filter((value) => value && value.toLowerCase() !== "not found"))];
}

function showMessage(toolbar, text) {
  let message = toolbar.querySelector(".mpl-claim-slice-message");
  if (!message) {
    message = document.createElement("span");
    message.className = "mpl-claim-slice-message";
    toolbar.appendChild(message);
  }
  message.textContent = text;
  window.setTimeout(() => message.remove(), 3600);
}

function filenameFromResponse(response, fallback) {
  const disposition = response.headers.get("content-disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const quoted = disposition.match(/filename="([^"]+)"/i);
  if (encoded) return decodeURIComponent(encoded[1]);
  if (quoted) return quoted[1];
  return fallback;
}

function claimSliceUrl(sourceUrl, claimNumber, internalNumber) {
  const base = String(sourceUrl || "").replace(/\/download\/?(?:\?.*)?$/i, "/claim-slice/");
  const params = new URLSearchParams({ claim_number: claimNumber });
  if (internalNumber) params.set("internal_claim_number", internalNumber);
  return `${base}?${params.toString()}`;
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

  const identifiers = claimIdentifiers(viewer, claimNumber);
  const internalNumber = identifiers.find((value) => value !== claimNumber) || "";
  const sourceUrl = sourceLink.getAttribute("href") || "";
  const url = claimSliceUrl(sourceUrl, claimNumber, internalNumber);

  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const response = await window.fetch(url, { credentials: "include" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Unable to create the sliced claim file.");
    }

    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filenameFromResponse(response, `claim_${claimNumber}.txt`);
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
  button.setAttribute("aria-label", "Download sliced claim file");
  button.title = "Download sliced claim file";
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
