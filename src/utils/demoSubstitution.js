// Cosmetic demo substitution. Keep API payloads and app state untouched.
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
// Fixed shuffled alphabets keep repeated values consistent across pages and sessions.
const LETTER_MAP = 'PHQGIUMEAYLNOFDXJKRCVSTZWB';
const DIGIT_MAP = '3749062851';
const originalText = new WeakMap();
const originalAttributes = new WeakMap();
const SKIP = 'script,style,noscript,textarea,select,option,svg,code,pre,[contenteditable],input';

export function encodeDemoText(value) {
  return String(value).replace(/[A-Za-z0-9]/g, character => {
    if (character >= '0' && character <= '9') return DIGIT_MAP[Number(character)];
    const encoded = LETTER_MAP[LETTERS.indexOf(character.toUpperCase())];
    return character === character.toLowerCase() ? encoded.toLowerCase() : encoded;
  });
}

function maskText(node) {
  if (!node.nodeValue?.trim() || node.parentElement?.closest(SKIP)) return;
  const previous = originalText.get(node);
  if (previous === node.nodeValue) return;
  const raw = previous && encodeDemoText(previous) === node.nodeValue
    ? previous
    : node.nodeValue;
  originalText.set(node, raw);
  node.nodeValue = encodeDemoText(raw);
}

function maskElement(element) {
  if (element.closest(SKIP)) return;
  for (const attribute of ['title', 'alt', 'aria-label']) {
    if (!element.hasAttribute(attribute)) continue;
    const originals = originalAttributes.get(element) || {};
    const current = element.getAttribute(attribute);
    if (originals[attribute] && encodeDemoText(originals[attribute]) === current) continue;
    originals[attribute] = current;
    originalAttributes.set(element, originals);
    element.setAttribute(attribute, encodeDemoText(current));
  }
}

function maskTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    maskText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || root.matches(SKIP)) return;
  maskElement(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) maskText(node);
    else maskElement(node);
  }
}

export function startDemoSubstitution() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('demo')) {
    if (params.get('demo') === '1') sessionStorage.setItem('mir-demo-substitution', '1');
    else sessionStorage.removeItem('mir-demo-substitution');
  }
  if (sessionStorage.getItem('mir-demo-substitution') !== '1') return () => {};
  const root = document.getElementById('root');
  if (!root) return () => {};
  maskTree(root);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') maskText(record.target);
      else if (record.type === 'attributes') maskElement(record.target);
      else for (const node of record.addedNodes) maskTree(node);
    }
  });
  observer.observe(root, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['title', 'alt', 'aria-label'],
  });
  return () => observer.disconnect();
}
