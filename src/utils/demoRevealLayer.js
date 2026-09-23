const REVEAL_CLASS = 'demo-reveal-value';
const REVEALED_CLASS = 'demo-reveal-value-revealed';

function isDemoEnabled() {
  return localStorage.getItem('mir-demo-substitution') === 'true';
}

function getRevealMap() {
  return window.__mirDemoRevealMap instanceof Map ? window.__mirDemoRevealMap : new Map();
}

function shouldSkip(node) {
  const parent = node.parentElement;
  if (!parent) return true;
  if (parent.closest('script,style,noscript,textarea,input,select,option,button,a,[contenteditable="true"]')) return true;
  if (parent.closest('.demo-reveal-value')) return true;
  return false;
}

function wrapNode(node) {
  if (!isDemoEnabled() || shouldSkip(node)) return;
  const map = getRevealMap();
  if (!map.size) return;

  const values = Array.from(map.entries())
    .filter(([masked]) => masked && node.nodeValue.includes(masked))
    .sort((a, b) => b[0].length - a[0].length);

  if (!values.length) return;

  let remaining = node.nodeValue;
  const fragment = document.createDocumentFragment();

  while (remaining) {
    let bestIndex = -1;
    let bestMasked = '';
    let bestEncoded = '';

    values.forEach(([masked, encoded]) => {
      const index = remaining.indexOf(masked);
      if (index >= 0 && (bestIndex < 0 || index < bestIndex || (index === bestIndex && masked.length > bestMasked.length))) {
        bestIndex = index;
        bestMasked = masked;
        bestEncoded = encoded;
      }
    });

    if (bestIndex < 0) {
      fragment.appendChild(document.createTextNode(remaining));
      break;
    }

    if (bestIndex > 0) fragment.appendChild(document.createTextNode(remaining.slice(0, bestIndex)));

    const button = document.createElement('button');
    button.type = 'button';
    button.className = REVEAL_CLASS;
    button.title = 'Click to reveal this encoded value';
    button.textContent = bestMasked;
    button.dataset.encodedValue = bestEncoded;
    button.addEventListener('click', () => {
      button.textContent = button.dataset.encodedValue || bestMasked;
      button.classList.add(REVEALED_CLASS);
      button.removeAttribute('title');
    });

    fragment.appendChild(button);
    remaining = remaining.slice(bestIndex + bestMasked.length);
  }
  if (fragment.childNodes.length) node.parentNode.replaceChild(fragment, node);
}

function scan(root) {
  if (!isDemoEnabled()) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  nodes.forEach(wrapNode);
}

export function startDemoRevealLayer() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const run = () => window.requestAnimationFrame(() => scan(document.body));
  run();

  const observer = new MutationObserver(() => run());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  return () => observer.disconnect();
}
