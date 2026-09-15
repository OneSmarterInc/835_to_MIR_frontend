import { safeFetchJson } from './api';

let installed = false;
let cachedNoticeId = '';
let cachedPayload = null;
let requestPromise = null;

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
    .mpl-ai-suggestion-paragraph{margin:10px 0 12px;color:#334a61;font-size:12px;line-height:1.6}
    .mpl-ai-suggestion-list{margin:0;padding-left:20px;color:#334a61;font-size:12px;line-height:1.6}
    .mpl-ai-suggestion-list li+li{margin-top:4px}
    .mpl-ai-suggestion-unavailable{margin:10px 0 0;color:#805000;font-size:12px;line-height:1.5}
    .mpl-notice-ai-claim{padding:10px 0;border-top:1px solid #dbe3ea}
    .mpl-notice-ai-claim:first-child{border-top:0}
    .mpl-notice-ai-claim strong{display:block;margin-bottom:6px;color:#172638}
  `;
  document.head.append(style);
}

function buildTitleRow(section, source) {
  const titleRow = document.createElement('div');
  titleRow.className = 'mpl-report-section-title';
  const title = document.createElement('h4');
  title.textContent = 'AI suggestion';
  const label = document.createElement('span');
  label.textContent = source ? `Qwen · ${source}` : 'Qwen';
  titleRow.append(title, label);
  section.append(titleRow);
}

function renderClaimSuggestion(card, payload) {
  const heading = card.querySelector('.mpl-report-card-head h3');
  const claimNumber = (heading?.textContent || '').trim();
  if (!claimNumber) return;

  const section = [...card.querySelectorAll('.mpl-report-section')]
    .find((node) => {
      const title = (node.querySelector('h4')?.textContent || '').trim().toLowerCase();
      return title === 'recommended resolution' || title === 'ai suggestion';
    });
  if (!section) return;

  const suggestion = payload?.claims?.find(
    (item) => String(item.claim_number || '').trim() === claimNumber,
  );
  const signature = suggestion
    ? `${payload?.source || ''}:${claimNumber}:${JSON.stringify(suggestion)}`
    : `unavailable:${claimNumber}:${payload?.source || ''}`;
  const currentTitle = (section.querySelector('h4')?.textContent || '').trim().toLowerCase();
  if (card.dataset.qwenSuggestionSignature === signature && currentTitle === 'ai suggestion') return;

  section.replaceChildren();
  buildTitleRow(section, payload?.source || '');
  if (!suggestion) {
    const note = document.createElement('p');
    note.className = 'mpl-ai-suggestion-unavailable';
    note.textContent = 'AI suggestion is not available for this analysis yet. Select Analyze Again after the Qwen service is running.';
    section.append(note);
    card.dataset.qwenSuggestionSignature = signature;
    return;
  }

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
  card.dataset.qwenSuggestionSignature = signature;
}

function updateTopAiBlock() {
  document.querySelectorAll('.mpl-section-toggle').forEach((button) => {
    const title = button.querySelector('strong');
    if (!title || !/claim-wise ai response|ai suggestion/i.test(title.textContent || '')) return;
    if (title.textContent !== 'AI suggestion') title.textContent = 'AI suggestion';
    const subtitle = title.parentElement?.querySelector('small');
    const subtitleText = 'Qwen professionally restates the Python-generated recommendations';
    if (subtitle && subtitle.textContent !== subtitleText) subtitle.textContent = subtitleText;
  });

  document.querySelectorAll('.mpl-notice-ai-response').forEach((article) => {
    const heading = article.querySelector('.mpl-claim-response-heading strong');
    if (heading && heading.textContent !== 'AI suggestions') heading.textContent = 'AI suggestions';
    const paragraph = article.querySelector('p');
    if (!paragraph || article.dataset.qwenFormatted === '1') return;
    try {
      const parsed = JSON.parse(paragraph.textContent || '');
      if (!Array.isArray(parsed?.claims)) return;
      paragraph.remove();
      parsed.claims.forEach((claim) => {
        const block = document.createElement('div');
        block.className = 'mpl-notice-ai-claim';
        const title = document.createElement('strong');
        title.textContent = claim.claim_number === 'NOTICE' ? 'AI suggestion' : `Claim ${claim.claim_number}`;
        const summary = document.createElement('p');
        summary.className = 'mpl-ai-suggestion-paragraph';
        summary.textContent = String(claim.paragraph || '').trim();
        const list = document.createElement('ul');
        list.className = 'mpl-ai-suggestion-list';
        (claim.bullets || []).forEach((value) => {
          const li = document.createElement('li');
          li.textContent = String(value || '').trim();
          if (li.textContent) list.append(li);
        });
        block.append(title, summary, list);
        article.append(block);
      });
      article.dataset.qwenFormatted = '1';
    } catch {
      // Older completed notices can contain the legacy plain-text response.
    }
  });
}

async function updateClaimCards() {
  const cards = [...document.querySelectorAll('.mpl-report-card')];
  if (!cards.length) return;
  const payload = await loadPayload();
  cards.forEach((card) => renderClaimSuggestion(card, payload));
}

function refresh() {
  ensureStyles();
  updateTopAiBlock();
  updateClaimCards();
}

export function installMplAiSuggestionView() {
  if (installed || typeof document === 'undefined') return () => {};
  installed = true;
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      refresh();
    });
  };

  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const resetForHistory = () => {
    cachedNoticeId = '';
    cachedPayload = null;
    schedule();
  };
  window.addEventListener('popstate', resetForHistory);
  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', resetForHistory);
    installed = false;
  };
}
