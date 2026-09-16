function normalizeArchiveCellText(cell, transform, marker) {
  if (!cell || cell.dataset?.[marker] === '1') return;
  const current = String(cell.textContent || '').trim();
  if (!current) return;

  const next = transform(current);
  if (!next || next === current) return;

  // Keep the existing React-owned element intact. Only adjust its visible text
  // so React's layout/reconciliation is not disrupted by replacing children.
  const target = cell.firstElementChild || cell;
  if (target.childElementCount === 0) {
    target.textContent = next;
  } else {
    // TimeDisplay is a single span in the archive table. If an unexpected nested
    // structure appears, fall back to the cell text without creating wrappers.
    cell.textContent = next;
  }

  cell.style.whiteSpace = 'pre-line';
  cell.style.overflowWrap = 'anywhere';
  cell.style.wordBreak = 'break-word';
  cell.style.verticalAlign = 'top';
  cell.dataset[marker] = '1';
}

function splitArchiveDateTime(cell) {
  normalizeArchiveCellText(
    cell,
    (text) => {
      const commaIndex = text.indexOf(',');
      if (commaIndex === -1) return text;
      const date = text.slice(0, commaIndex).trim();
      const time = text.slice(commaIndex + 1).trim();
      return date && time ? `${date}\n${time}` : text;
    },
    'archiveDateEnhanced',
  );
}

function stackArchive835Files(cell) {
  normalizeArchiveCellText(
    cell,
    (text) => text
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n'),
    'archiveFilesEnhanced',
  );
}

function enhanceArchiveTable(table) {
  const headers = Array.from(table.querySelectorAll('thead th'));
  const headerTexts = headers.map((header) => String(header.textContent || '').trim().toUpperCase());
  const dateIndex = headerTexts.findIndex((text) => text.includes('835 DATE / TIME'));
  const inputIndex = headerTexts.findIndex((text) => text.includes('835 INPUT'));
  const refIndex = headerTexts.findIndex((text) => text.includes('837 REF'));

  if (dateIndex === -1 || inputIndex === -1 || refIndex === -1) return;

  // Hide only the obsolete 837 reference header/cells. Do not collapse the
  // colgroup; browsers can produce pathological table heights when a fixed
  // table combines visibility:collapse with hidden cells.
  headers[refIndex].style.display = 'none';

  Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
    const cells = Array.from(row.children);
    if (!cells.length) return;

    if (cells[refIndex]) cells[refIndex].style.display = 'none';
    splitArchiveDateTime(cells[dateIndex]);
    stackArchive835Files(cells[inputIndex]);

    // Keep archive rows compact and aligned at the top, even for batch rows.
    row.style.height = 'auto';
    Array.from(row.children).forEach((cell) => {
      cell.style.height = 'auto';
      cell.style.verticalAlign = 'top';
    });
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

// React can replace rows during filtering/pagination. Re-apply formatting only
// when nodes are added; avoid character-data observation so this helper cannot
// create a self-triggering layout loop.
new MutationObserver(queueEnhancement).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
