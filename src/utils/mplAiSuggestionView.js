import { safeFetchJson } from './api';

let installed = false;
let cachedNoticeId = '';
let cachedPayload = null;
let requestPromise = null;
let refreshQueued = false;

function activeNoticeId() {
  return new URLSearchParams(window.location.search).get('notice') || '';
}

function parseAiResponse(notice) {
  if (!notice?.ai_response || !notice?.ai_response_source) return null;
  try {
    const parsed = JSON.parse(notice.ai_response);
    if (!Array.isArray(parsed?.claims)) return null;
    return {
      source: notice.ai_response_source,
      claims: parsed.claims.filter((item) => item && typeof item === 'object'),
    };
  } catch {
    return null;
  }
}

async function loadPayload() {
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

function ensureStyles() {
  if (document.getElementById('mpl-qwen-suggestion-styles')) return;
  const style = document.createElement('style');
  style.id = 'mpl-qwen-suggestion-styles';
  style.textContent = `
    .mpl-ai-suggestion-section{background:#fff}
    .mpl-ai-suggestion-paragraph{margin:10px 0 12px;color:#334a61;font-size:12px;line-height:1.65}
    .mpl-ai-suggestion-list{margin:0;padding-left:20px;color:#334a61;font-size:12px;line-height:1.65}
    .mpl-ai-suggestion-list li+li{margin-top:5px}
    .mpl-ai-suggestion-unavailable{margin:10px 0 0;color:#805000;font-size:12px;line-height:1.5}
    .mpl-ai-suggestion-loading{margin:10px 0 0;color:#66788d;font-size:12px;line-height:1.5}
    .mpl-analyze-again-error{align-self:center;margin-left:4px;color:#a33a2d;font-size:11px;line-height:1.3}
  `;
  document.head.append(style);
}

function ensureAnalyzeAgainButton() {
  const actions = document.querySelector('.mpl-detail-page-actions');
  const noticeId = activeNoticeId();
  if (!actions || !noticeId) return;
  if (actions.querySelector('[data-mpl-analyze-again="1"]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mpl-btn primary';
  button.dataset.mplAnalyzeAgain = '1';
  button.textContent = 'Analyze Again';

  button.addEventListener('click', async () => {
    const existingError = actions.querySelector('.mpl-analyze-again-error');
    if (existingError) existingError.remove();
    button.disabled = true;
    button.textContent = 'Analyzing…';
    try {
      const { res, data } = await safeFetchJson(
        `/edi835/api/mpl-notices/${encodeURIComponent(noticeId)}/analyze/`,
        { method: 'POST' },
      );
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to start analysis.');
      }
      cachedNoticeId = '';
      cachedPayload = null;
      window.location.reload();
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Analyze Again';
      const message = document.createElement('span');
      message.className = 'mpl-analyze-again-error';
      message.textContent = error?.message || 'Unable to start analysis.';
      button.insertAdjacentElement('afterend', message);
    }
  });

  const download = actions.querySelector('.mpl-msg-download');
  if (download) download.insertAdjacentElement('afterend', button);
  else actions.append(button);
}

function findSuggestionSection(card) {
  return [...card.querySelectorAll('.mpl-report-section')].find((section) => {
    const title = (section.querySelector('.mpl-report-section-title h4')?.textContent || '')
      .trim()
      .toLowerCase();
    return title === 'recommended resolution' || title === 'ai suggestion';
  }) || null;
}

function buildHeading(section, sourceLabel = '') {
  const row = document.createElement('div');
  row.className = 'mpl-report-section-title';
  const title = document.createElement('h4');
  title.textContent = 'AI suggestion';
  const source = document.createElement('span');
  source.textContent = 'AI';
  row.append(title, source);
  section.append(row);
}

function markLoading(section) {
  section.dataset.aiSuggestionState = 'loading';
  section.classList.add('mpl-ai-suggestion-section');
  section.replaceChildren();
  buildHeading(section);
  const note = document.createElement('p');
  note.className = 'mpl-ai-suggestion-loading';
  note.textContent = 'Loading AI suggestion…';
  section.append(note);
}

function renderUnavailable(section) {
  section.dataset.aiSuggestionState = 'unavailable';
  section.classList.add('mpl-ai-suggestion-section');
  section.replaceChildren();
  buildHeading(section);
  const note = document.createElement('p');
  note.className = 'mpl-ai-suggestion-unavailable';
  note.textContent = 'AI suggestion not available or under processing.';
  section.append(note);
}

function renderSuggestion(section, suggestion, sourceLabel) {
  section.dataset.aiSuggestionState = 'done';
  section.classList.add('mpl-ai-suggestion-section');
  section.replaceChildren();
  buildHeading(section, sourceLabel);

  const paragraph = document.createElement('p');
  paragraph.className = 'mpl-ai-suggestion-paragraph';
  paragraph.textContent = String(suggestion.paragraph || '').trim();
  section.append(paragraph);

  const list = document.createElement('ul');
  list.className = 'mpl-ai-suggestion-list';
  (suggestion.bullets || []).forEach((value) => {
    const text = String(value || '').trim();
    if (!text) return;
    const item = document.createElement('li');
    item.textContent = text;
    list.append(item);
  });
  section.append(list);
}

function claimNumberForCard(card) {
  return (card.querySelector('.mpl-report-card-head h3')?.textContent || '').trim();
}

function hideLegacyTopAiBlock() {
  document.querySelectorAll('.mpl-disclosure').forEach((section) => {
    const title = section.querySelector('.mpl-section-toggle strong');
    if (!title) return;
    if (/claim-wise ai response|ai suggestion/i.test(title.textContent || '')) {
      section.style.display = 'none';
      section.setAttribute('aria-hidden', 'true');
    }
  });
}

async function enhanceClaimCards() {
  const cards = [...document.querySelectorAll('.mpl-report-card')];
  if (!cards.length) return;

  const pending = [];
  cards.forEach((card) => {
    const section = findSuggestionSection(card);
    const claimNumber = claimNumberForCard(card);
    if (!section || !claimNumber) return;

    // Remove the Python list immediately. The user-facing recommendation is
    // Qwen's professional restatement of the Python-generated guidance.
    if (!section.dataset.aiSuggestionState) markLoading(section);
    if (section.dataset.aiSuggestionState !== 'done') {
      pending.push({ card, section, claimNumber });
    }
  });

  if (!pending.length) return;
  const payload = await loadPayload();

  pending.forEach(({ card, section, claimNumber }) => {
    if (!document.documentElement.contains(card)) return;
    const liveSection = findSuggestionSection(card) || section;
    const suggestion = payload?.claims?.find(
      (item) => String(item.claim_number || '').trim() === claimNumber,
    );
    if (!suggestion) {
      renderUnavailable(liveSection);
      return;
    }
    renderSuggestion(liveSection, suggestion, payload.source || '');
  });
}

function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  window.requestAnimationFrame(() => {
    refreshQueued = false;
    ensureStyles();
    ensureAnalyzeAgainButton();
    hideLegacyTopAiBlock();
    enhanceClaimCards();
  });
}

export function installMplAiSuggestionView() {
  if (installed || typeof document === 'undefined') return () => {};
  installed = true;
  scheduleRefresh();

  const observer = new MutationObserver((mutations) => {
    const meaningful = mutations.some((mutation) => {
      const target = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
      return !target?.closest?.('.mpl-ai-suggestion-section');
    });
    if (meaningful) scheduleRefresh();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const resetForHistory = () => {
    cachedNoticeId = '';
    cachedPayload = null;
    scheduleRefresh();
  };
  window.addEventListener('popstate', resetForHistory);

  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', resetForHistory);
    installed = false;
  };
}
