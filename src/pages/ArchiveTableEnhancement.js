function formatArchiveDateTime(text) {
  const value = String(text || '').trim();
  if (!value) return value;

  // Intl output normally contains a comma between date and time. Keep a
  // regex fallback because some browsers/locales omit that comma.
  const commaIndex = value.indexOf(',');
  if (commaIndex !== -1) {
    const date = value.slice(0, commaIndex).trim();
    const time = value.slice(commaIndex + 1).trim();
    return date && time ? `${date}\n${time}` : value;
  }

  const match = value.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)$/);
  return match ? `${match[1]}\n${match[2]}` : value;
}

function formatArchive835Files(text) {
  return String(text || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n');
}

function setCellText(cell, formatter) {
  if (!cell) return;
  const current = String(cell.textContent || '').trim();
  if (!current) return;

  const next = formatter(current);
  const target = cell.firstElementChild || cell;

  // Only touch the visible text node. This keeps the React-owned table/cell
  // structure intact while letting the browser size the row naturally.
  if (target.textContent !== next) target.textContent = next;

  cell.style.whiteSpace = 'pre-line';
  cell.style.overflowWrap = 'normal';
  cell.style.wordBreak = 'normal';
  cell.style.verticalAlign = 'top';
  cell.style.lineHeight = '1.35';
}

function applyArchiveColumnWidths(table, headers, refIndex) {
  // Removing a TD/TH with display:none while leaving a fixed-layout colgroup
  // causes the remaining cells to be assigned to the wrong column widths.
  // Switch this archive table to auto layout and hide the matching COL too.
  table.style.tableLayout = 'auto';
  table.style.width = '100%';
  table.style.maxWidth = 'none';

  const wrapper = table.parentElement;
  if (wrapper) {
    wrapper.style.overflowX = 'auto';
    wrapper.style.maxWidth = '100%';
  }

  const cols = Array.from(table.querySelectorAll('colgroup col'));
  if (cols[refIndex]) {
    cols[refIndex].style.display = 'none';
    cols[refIndex].style.width = '0';
  }

  // Stable widths for the nine visible archive columns. The 835 and MIR
  // columns get the most room, which prevents batch filenames from colliding
  // with neighboring values.
  const visibleWidths = ['14%', '7%', '24%', '18%', '6%', '8%', '8%', '10%', '5%'];
  let visibleIndex = 0;
  headers.forEach((header, index) => {
    if (index === refIndex) return;
    const width = visibleWidths[visibleIndex++] || 'auto';
    header.style.width = width;
    header.style.minWidth = index === 2 ? '260px' : '';
  });
}

function enhanceArchiveTable(table) {
  const headers = Array.from(table.querySelectorAll('thead th'));
  const headerTexts = headers.map((header) => String(header.textContent || '').trim().toUpperCase());
  const dateIndex = headerTexts.findIndex((text) => text.includes('835 DATE / TIME'));
  const inputIndex = headerTexts.findIndex((text) => text.includes('835 INPUT'));
  const refIndex = headerTexts.findIndex((text) => text.includes('837 REF'));

  if (dateIndex === -1 || inputIndex === -1 || refIndex === -1) return;

  applyArchiveColumnWidths(table, headers, refIndex);
  headers[refIndex].style.display = 'none';

  Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
    const cells = Array.from(row.children);
    if (!cells.length) return;

    if (cells[refIndex]) cells[refIndex].style.display = 'none';

    setCellText(cells[dateIndex], formatArchiveDateTime);
    setCellText(cells[inputIndex], formatArchive835Files);

    // Keep filenames readable and prevent content from spilling into the MIR
    // or claims columns.
    if (cells[inputIndex]) {
      cells[inputIndex].style.minWidth = '260px';
      cells[inputIndex].style.whiteSpace = 'pre-line';
    }

    row.style.height = 'auto';
    Array.from(row.children).forEach((cell) => {
      cell.style.height = 'auto';
      cell.style.verticalAlign = 'top';
      cell.style.boxSizing = 'border-box';
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

// React replaces rows during filtering, pagination and refresh. Re-apply the
// archive-only presentation when those nodes change.
new MutationObserver(queueEnhancement).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
