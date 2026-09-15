import { safeFetchJson } from "./api";

let cachedNoticeId = "";
let cachedPayload = null;
let requestPromise = null;

function activeNoticeId() {
  return new URLSearchParams(window.location.search).get("notice") || "";
}

function parseAiResponse(notice) {
  if (!notice?.ai_response || !notice?.ai_response_source) return null;
  try {
    const parsed = JSON.parse(notice.ai_response);
    if (!Array.isArray(parsed?.claims)) return null;
    return {
      source: notice.ai_response_source,
      claims: parsed.claims.filter((item) => item && typeof item === "object"),
    };
  } catch {
    return null;
  }
}

async function loadAiPayload() {
  const noticeId = activeNoticeId();
  if (!noticeId) return null;
  if (noticeId === cachedNoticeId && cachedPayload) return cachedPayload;
  if (requestPromise && noticeId === cachedNoticeId) return requestPromise;

  cachedNoticeId = noticeId;
  cachedPayload = null;
  requestPromise = safeFetchJson(`/edi835/api/mpl-notices/${encodeURIComponent(noticeId)}/`)
    .then(({ res, data }) => {
      if (!res.ok || !data?.success) return null;
      cachedPayload = parseAiResponse(data.notice);
      return cachedPayload;
    })
    .catch(() => null)
    .finally(() => { requestPromise = null; });
  return requestPromise;
}

function buildUnavailable(section) {
  section.replaceChildren();
  const titleRow = document.createElement("div");
  titleRow.className = "mpl-report-section-title";
  titleRow.innerHTML = "<h4>AI suggestion</h4><span>Qwen</span>";
  const note = document.createElement("p");
  note.className = "mpl-ai-suggestion-unavailable";
  note.textContent = "AI suggestion is not available for this analysis yet. Select Analyze Again after the Qwen service is running.";
  section.append(titleRow, note);
}

function renderSuggestion(card, payload) {
  if (card.dataset.qwenSuggestionRendered === "1") return;
  const heading = card.querySelector(".mpl-report-card-head h3");
  const claimNumber = (heading?.textContent || "").trim();
  if (!claimNumber) return;

  const section = [...card.querySelectorAll(".mpl-report-section")]
    .find((node) => (node.querySelector("h4")?.textContent || "").trim().toLowerCase() === "recommended resolution");
  if (!section) return;

  const suggestion = payload?.claims?.find(
    (item) => String(item.claim_number || "").trim() === claimNumber,
  );
  if (!suggestion) {
    buildUnavailable(section);
    card.dataset.qwenSuggestionRendered = "1";
    return;
  }

  section.replaceChildren();
  section.classList.add("mpl-ai-suggestion-section");

  const titleRow = document.createElement("div");
  titleRow.className = "mpl-report-section-title";
  const title = document.createElement("h4");
  title.textContent = "AI suggestion";
  const source = document.createElement("span");
  source.textContent = `Qwen · ${payload.source}`;
  titleRow.append(title, source);

  const paragraph = document.createElement("p");
  paragraph.className = "mpl-ai-suggestion-paragraph";
  paragraph.textContent = String(suggestion.paragraph || "").trim();

  const list = document.createElement("ul");
  list.className = "mpl-ai-suggestion-list";
  (suggestion.bullets || []).forEach((value) => {
    const text = String(value || "").trim();
    if (!text) return;
    const item = document.createElement("li");
    item.textContent = text;
    list.append(item);
  });

  section.append(titleRow, paragraph, list);
  card.dataset.qwenSuggestionRendered = "1";
}

async function enhance() {
  const cards = [...document.querySelectorAll(".mpl-report-card")]
    .filter((card) => card.querySelector(".mpl-report-section h4"));
  if (!cards.length) return;
  const payload = await loadAiPayload();
  cards.forEach((card) => renderSuggestion(card, payload));
}

export function installMplAiSuggestionEnhancement() {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  };

  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", () => {
    cachedNoticeId = "";
    cachedPayload = null;
    schedule();
  });
  return () => observer.disconnect();
}
