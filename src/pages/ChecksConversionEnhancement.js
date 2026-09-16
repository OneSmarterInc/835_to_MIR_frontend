function firstFilename(value) {
  const text = String(value || '').trim();
  if (!text || text === '—') return '';
  return text
    .split(/\s*,\s*|\s*;\s*|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)[0] || '';
}

function renderPreviousFilesCell(cell) {
  if (!cell || cell.dataset.checksPreviousFilesEnhanced === '1') return;

  const childTexts = Array.from(cell.children).map((child) => String(child.textContent || '').trim());
  const flatText = String(cell.textContent || '').trim();

  let mirText = childTexts[0] || flatText;
  let source835Text = childTexts[1] || '';

  if (!source835Text && /835\s*:/i.test(flatText)) {
    const parts = flatText.split(/835\s*:/i);
    mirText = parts[0] || '';
    source835Text = parts.slice(1).join('835:');
  }

  source835Text = source835Text.replace(/^835\s*:\s*/i, '');
  const mirFilename = firstFilename(mirText);
  const source835Filename = firstFilename(source835Text);

  cell.dataset.checksPreviousFilesEnhanced = '1';
  cell.replaceChildren();

  const makeLine = (label, filename) => {
    const line = document.createElement('div');
    line.style.display = 'flex';
    line.style.alignItems = 'flex-start';
    line.style.gap = '5px';
    line.style.minWidth = '0';
    line.style.lineHeight = '1.3';

    const labelNode = document.createElement('span');
    labelNode.textContent = label;
    labelNode.style.flex = '0 0 auto';
    labelNode.style.fontSize = '10px';
    labelNode.style.fontWeight = '700';
    labelNode.style.color = 'var(--ink-3)';

    const valueNode = document.createElement('span');
    valueNode.textContent = filename || '—';
    valueNode.style.minWidth = '0';
    valueNode.style.overflowWrap = 'anywhere';
    valueNode.style.wordBreak = 'break-word';
    valueNode.style.fontWeight = '600';

    line.append(labelNode, valueNode);
    return line;
  };

  if (mirFilename) cell.appendChild(makeLine('MIR', mirFilename));
  if (source835Filename) {
    const sourceLine = makeLine('835', source835Filename);
    if (mirFilename) sourceLine.style.marginTop = '4px';
    cell.appendChild(sourceLine);
  }

  if (!mirFilename && !source835Filename) {
    const empty = document.createElement('span');
    empty.textContent = '—';
    cell.appendChild(empty);
  }
}

function enhanceConversionFindingsTable(table) {
  const headers = Array.from(table.querySelectorAll('thead th'));
  if (!headers.length) return;

  const headerTexts = headers.map((header) => String(header.textContent || '').trim().toUpperCase());
  const claimIndex = headerTexts.findIndex((text) => text === 'CLAIM');
  const resolutionIndex = headerTexts.findIndex((text) => text === 'RESOLUTION');
  const reasonIndex = headerTexts.findIndex((text) => text === 'HOLD REASON');
  const filesIndex = headerTexts.findIndex((text) => text === 'PREVIOUS MIR FILE' || text === 'PREVIOUSLY SENT FILES');
  const sentIndex = headerTexts.findIndex((text) => text === 'PREVIOUSLY SENT' || text === 'SENT AT');
  const eligibleIndex = headerTexts.findIndex((text) => text === 'ELIGIBLE TO SEND');

  if ([claimIndex, resolutionIndex, reasonIndex, filesIndex, sentIndex, eligibleIndex].some((index) => index < 0)) return;

  headers[filesIndex].textContent = 'PREVIOUSLY SENT FILES';
  headers[sentIndex].textContent = 'SENT AT';

  table.style.width = '100%';
  table.style.maxWidth = '100%';
  table.style.tableLayout = 'fixed';

  const wrapper = table.parentElement;
  if (wrapper) {
    wrapper.style.overflowX = 'hidden';
    wrapper.style.maxWidth = '100%';
  }

  const widths = new Map([
    [claimIndex, '13%'],
    [resolutionIndex, '11%'],
    [reasonIndex, '34%'],
    [filesIndex, '20%'],
    [sentIndex, '11%'],
    [eligibleIndex, '11%'],
  ]);

  headers.forEach((header, index) => {
    header.style.width = widths.get(index) || 'auto';
    header.style.minWidth = '0';
    header.style.whiteSpace = 'normal';
    header.style.overflowWrap = 'anywhere';
    header.style.wordBreak = 'break-word';
    header.style.verticalAlign = 'top';
  });

  Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
    const cells = Array.from(row.children);
    if (cells.length < headers.length) return;

    row.style.height = 'auto';
    cells.forEach((cell) => {
      cell.style.height = 'auto';
      cell.style.minWidth = '0';
      cell.style.maxWidth = 'none';
      cell.style.padding = '10px 12px';
      cell.style.verticalAlign = 'top';
      cell.style.whiteSpace = 'normal';
      cell.style.overflowWrap = 'anywhere';
      cell.style.wordBreak = 'break-word';
      cell.style.lineHeight = '1.35';
    });

    renderPreviousFilesCell(cells[filesIndex]);
  });
}

function enhanceConversionFindingsTables() {
  document.querySelectorAll('table.datatable').forEach((table) => enhanceConversionFindingsTable(table));
}

let enhancementQueued = false;
function queueConversionFindingsEnhancement() {
  if (enhancementQueued) return;
  enhancementQueued = true;
  requestAnimationFrame(() => {
    enhancementQueued = false;
    enhanceConversionFindingsTables();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', queueConversionFindingsEnhancement, { once: true });
} else {
  queueConversionFindingsEnhancement();
}

new MutationObserver(queueConversionFindingsEnhancement).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
