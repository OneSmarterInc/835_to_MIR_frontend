function splitDateTimeCell(cell) {
  if (!cell || cell.querySelector('.archive-date-time-stack')) return;
  const text = String(cell.textContent || '').trim();
  if (!text) return;

  const commaIndex = text.indexOf(',');
  if (commaIndex === -1) return;

  const dateText = text.slice(0, commaIndex).trim();
  const timeText = text.slice(commaIndex + 1).trim();
  if (!dateText || !timeText) return;

  const stack = document.createElement('div');
  stack.className = 'archive-date-time-stack';
  stack.style.display = 'grid';
  stack.style.gap = '3px';
  stack.style.lineHeight = '1.25';
  stack.style.whiteSpace = 'nowrap';

  const date = document.createElement('div');
  date.textContent = dateText;
  const time = document.createElement('div');
  time.textContent = timeText;

  stack.append(date, time);
  cell.replaceChildren(stack);
}

function stack835Files(cell) {
  if (!cell || cell.querySelector('.archive-835-file-stack')) return;
  const text = String(cell.textContent || '').trim();
  if (!text) return;

  const files = text
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!files.length) return;

  const stack = document.createElement('div');
  stack.className = 'archive-835-file-stack';
  stack.style.display = 'grid';
  stack.style.gap = '4px';
  stack.style.minWidth = '0';

  files.forEach((filename) => {
    const row = document.createElement('div');
    row.textContent = filename;
    row.style.whiteSpace = 'normal';
    row.style.overflowWrap = 'anywhere';
    row.style.wordBreak = 'break-word';
    row.style.lineHeight = '1.25';
    stack.appendChild(row);
  });

  cell.replaceChildren(stack);
}

function enhanceArchiveTable(table) {
  const headers = Array.from(table.querySelectorAll('thead th'));
  const headerTexts = headers.map((header) => String(header.textContent || '').trim().toUpperCase());
  const dateIndex = headerTexts.findIndex((text) => text.includes('835 DATE / TIME'));
  const inputIndex = headerTexts.findIndex((text) => text.includes('835 INPUT'));
  const refIndex = headerTexts.findIndex((text) => text.includes('837 REF'));

  if (dateIndex === -1 || inputIndex === -1 || refIndex === -1) return;

  const cols = table.querySelectorAll('colgroup col');
  if (cols[inputIndex]) cols[inputIndex].style.width = '18%';
  if (cols[refIndex]) {
    cols[refIndex].style.width = '0';
    cols[refIndex].style.visibility = 'collapse';
  }

  const refHeader = headers[refIndex];
  if (refHeader) refHeader.style.display = 'none';

  Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
    const cells = row.children;
    if (!cells.length) return;

    const refCell = cells[refIndex];
    if (refCell) refCell.style.display = 'none';

    splitDateTimeCell(cells[dateIndex]);
    stack835Files(cells[inputIndex]);
  });
}

function enhanceArchiveTables() {
  document.querySelectorAll('table.datatable').forEach((table) => enhanceArchiveTable(table));
}

let queued = false;
function queueEnhancement() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    enhanceArchiveTables();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', queueEnhancement, { once: true });
} else {
  queueEnhancement();
}

new MutationObserver(queueEnhancement).observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});
