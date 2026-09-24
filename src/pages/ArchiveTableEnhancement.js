function formatArchiveDateTime(text) {
  const value = String(text || '').trim();
  if (!value) return value;

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
  if (target.textContent !== next) target.textContent = next;

  cell.style.whiteSpace = 'pre-line';
  cell.style.overflowWrap = 'anywhere';
  cell.style.wordBreak = 'break-word';
  cell.style.verticalAlign = 'top';
  cell.style.lineHeight = '1.35';
}

function applyArchiveColumnWidths(table, headers, refIndex) {
  // Fit the entire Archive table inside the available viewport. Long values
  // wrap vertically instead of forcing a horizontal scrollbar.
  table.style.tableLayout = 'fixed';
  table.style.width = '100%';
  table.style.maxWidth = '100%';
  table.style.minWidth = '0';

  const wrapper = table.parentElement;
  if (wrapper) {
    wrapper.style.width = '100%';
    wrapper.style.maxWidth = '100%';
    wrapper.style.overflowX = 'hidden';
  }

  const cols = Array.from(table.querySelectorAll('colgroup col'));

  // Widths for the nine visible columns after removing 837 REF.
  // DATE, RUN, 835, MIR, CLAIMS, IMPORT, SFTP, STATUS, ACTION = 100%.
  const visibleWidths = ['14%', '7%', '24%', '17%', '5%', '7%', '7%', '13%', '6%'];
  let visibleIndex = 0;

  headers.forEach((header, index) => {
    if (index === refIndex) {
      header.style.display = 'none';
      header.style.width = '0';
      header.style.minWidth = '0';
      header.style.maxWidth = '0';
      if (cols[index]) {
        cols[index].style.display = 'none';
        cols[index].style.width = '0';
        cols[index].style.minWidth = '0';
        cols[index].style.maxWidth = '0';
      }
      return;
    }

    const width = visibleWidths[visibleIndex++] || 'auto';
    header.style.width = width;
    header.style.minWidth = '0';
    header.style.maxWidth = 'none';
    header.style.whiteSpace = 'normal';
    header.style.overflowWrap = 'anywhere';
    header.style.wordBreak = 'break-word';

    if (cols[index]) {
      cols[index].style.display = '';
      cols[index].style.width = width;
      cols[index].style.minWidth = '0';
      cols[index].style.maxWidth = 'none';
    }
  });
}

function styleArchiveCell(cell) {
  if (!cell) return;
  cell.style.height = 'auto';
  cell.style.minWidth = '0';
  cell.style.maxWidth = '100%';
  cell.style.boxSizing = 'border-box';
  cell.style.verticalAlign = 'top';
  cell.style.whiteSpace = 'normal';
  cell.style.overflowWrap = 'anywhere';
  cell.style.wordBreak = 'break-word';
  cell.style.overflow = 'hidden';

  cell.querySelectorAll('.tag').forEach((tag) => {
    tag.style.maxWidth = '100%';
    tag.style.whiteSpace = 'normal';
    tag.style.overflowWrap = 'anywhere';
    tag.style.wordBreak = 'break-word';
    tag.style.textAlign = 'center';
    tag.style.lineHeight = '1.2';
  });
}

function shrinkArchiveActionButtons(cell) {
  if (!cell) return;

  const group = cell.querySelector('.file-action-buttons');
  if (group) {
    group.style.gap = '5px';
  }

  cell.querySelectorAll('.file-action-button').forEach((button) => {
    button.style.width = '30px';
    button.style.minWidth = '30px';
    button.style.height = '30px';
    button.style.padding = '0';
    button.style.borderRadius = '6px';
  });

  cell.querySelectorAll('.file-action-button svg').forEach((icon) => {
    icon.style.width = '13px';
    icon.style.height = '13px';
  });
}

function enhanceArchiveTable(table) {
  const headers = Array.from(table.querySelectorAll('thead th'));
  const headerTexts = headers.map((header) => String(header.textContent || '').trim().toUpperCase());
  const dateIndex = headerTexts.findIndex((text) => text.includes('835 DATE / TIME'));
  const inputIndex = headerTexts.findIndex((text) => text.includes('835 INPUT'));
  const refIndex = headerTexts.findIndex((text) => text.includes('837 REF'));
  const actionIndex = headerTexts.findIndex((text) => text === 'ACTION');

  if (dateIndex === -1 || inputIndex === -1 || refIndex === -1) return;

  applyArchiveColumnWidths(table, headers, refIndex);

  Array.from(table.querySelectorAll('tbody tr')).forEach((row) => {
    const cells = Array.from(row.children);
    if (!cells.length) return;

    if (cells[refIndex]) {
      cells[refIndex].style.display = 'none';
      cells[refIndex].style.width = '0';
      cells[refIndex].style.minWidth = '0';
      cells[refIndex].style.maxWidth = '0';
    }

    setCellText(cells[dateIndex], formatArchiveDateTime);
    setCellText(cells[inputIndex], formatArchive835Files);

    row.style.height = 'auto';
    cells.forEach((cell, index) => {
      if (index !== refIndex) styleArchiveCell(cell);
    });

    if (cells[dateIndex]) cells[dateIndex].style.whiteSpace = 'pre-line';
    if (cells[inputIndex]) cells[inputIndex].style.whiteSpace = 'pre-line';
    if (actionIndex !== -1) shrinkArchiveActionButtons(cells[actionIndex]);
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
});
