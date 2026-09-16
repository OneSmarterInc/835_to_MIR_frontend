const ADMIN_NAV_BY_LABEL = new Map([
  ['All Clients', 'clients'],
  ['Onboarding', 'onboard'],
  ['Documents', 'docs'],
  ['Conversions', 'conversions'],
  ['Search', 'search'],
  ['MPL Notices', 'notices'],
  ['Checks', 'checks'],
  ['Reconciliation', 'result'],
  ['SFTP Automation', 'sftp-automation'],
  ['Archive', 'files'],
  ['Code Dictionary', 'code-dictionary'],
  ['Go Live', 'promote'],
  ['Trust Center', 'trust'],
  ['Operations & Delivery', 'ops'],
  ['Access', 'access'],
  ['Defaults', 'defaults'],
  ['Audit Log', 'audit'],
  ['Offboarding', 'offboard'],
]);

let installed = false;
let restoring = false;
let originalPushState;
let originalReplaceState;

function cleanText(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function notifyNavigation() {
  window.dispatchEvent(new Event('onesmarter:navigation'));
}

function pushUrl(mutator) {
  const url = new URL(window.location.href);
  mutator(url);
  if (url.toString() === window.location.href) return;
  originalPushState.call(window.history, { ...(window.history.state || {}), oneSmarterNav: true }, '', url.toString());
  notifyNavigation();
}

function setView(view) {
  pushUrl((url) => {
    if (view) url.searchParams.set('view', view);
    else url.searchParams.delete('view');
  });
}

function adminNavForButton(button) {
  if (!button?.matches('.rail .navitem')) return '';
  const label = cleanText(button.querySelector('span:first-child') || button);
  return ADMIN_NAV_BY_LABEL.get(label) || '';
}

function clickWithoutHistory(element) {
  if (!element) return false;
  restoring = true;
  try {
    element.click();
  } finally {
    queueMicrotask(() => { restoring = false; });
  }
  return true;
}

function closeViewsNotInHistory(desiredView) {
  // Native React RECON archive overlay is URL-driven and removes itself. The
  // original ResultView detail layer underneath still needs its own React close
  // action when history leaves the archive.
  const reconArchive = [...document.querySelectorAll('.result-detail-backdrop')].find(
    (node) => node.querySelector('#uploaded-recon-title'),
  );
  if (reconArchive && !['recon-archive', 'recon-file'].includes(desiredView)) {
    clickWithoutHistory(reconArchive.querySelector('.result-detail-title button'));
  }

  const reconAction = document.querySelector('.recon-popup-backdrop');
  if (reconAction && desiredView !== 'recon-action') {
    clickWithoutHistory(reconAction.querySelector('.recon-popup-header .modal-cross-btn'));
  }

  const fileViewer = document.querySelector('.file-viewer-page-shell');
  if (fileViewer && desiredView !== 'file-viewer') {
    clickWithoutHistory(fileViewer.querySelector('.file-viewer-back'));
  }

  const mplSource = document.querySelector('.mpl-file-viewer');
  if (mplSource && desiredView !== 'mpl-source') {
    clickWithoutHistory(mplSource.querySelector('[aria-label="Close file viewer"]'));
  }
}

function syncTopLevelScreenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const pathname = window.location.pathname.toLowerCase();

  if (pathname.includes('administrator') || pathname.includes('adminstrator')) {
    const nav = params.get('nav');
    if (nav) {
      const button = [...document.querySelectorAll('.rail .navitem')].find((candidate) => adminNavForButton(candidate) === nav);
      if (button && !button.classList.contains('on')) clickWithoutHistory(button);
    }
    return;
  }

  const tab = params.get('tab');
  if (tab) {
    try { localStorage.setItem('activeTab', tab); } catch {}
    const button = document.querySelector(`#navDrawer .navitem[data-v="${CSS.escape(tab)}"]`);
    if (button && !button.classList.contains('on')) clickWithoutHistory(button);
  }
}

function restoreFromLocation() {
  const desiredView = new URLSearchParams(window.location.search).get('view') || '';
  closeViewsNotInHistory(desiredView);
  notifyNavigation();
  window.requestAnimationFrame(syncTopLevelScreenFromUrl);
}

function interceptNavigationClick(event) {
  if (restoring || event.defaultPrevented) return;
  const button = event.target.closest('button');
  if (!button) return;

  // The React RECON archive owns its own eye/download/back interactions and
  // updates history directly. Do not duplicate those state transitions here.
  if (button.closest('.recon-archive-react-page, .recon-react-preview')) return;

  const clientTab = button.closest('#navDrawer') ? button.dataset.v : '';
  if (clientTab) {
    pushUrl((url) => {
      url.searchParams.set('tab', clientTab);
      url.searchParams.delete('view');
    });
    return;
  }

  const adminNav = adminNavForButton(button);
  if (adminNav) {
    pushUrl((url) => {
      url.searchParams.set('nav', adminNav);
      url.searchParams.delete('view');
    });
    return;
  }

  if (button.matches('.result-reconciliation-button')) {
    setView('recon-action');
    return;
  }
  if (button.matches('.result-files-button')) {
    setView('recon-archive');
    return;
  }
  if (button.matches('.mpl-eye-button')) {
    setView('mpl-source');
    return;
  }
  if (
    button.matches('.btn-eye') ||
    button.matches('.files-single-eye') ||
    /view\s*\/\s*edit code/i.test(button.title || '')
  ) {
    setView('file-viewer');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const isBackForCurrentView =
    (view === 'file-viewer' && button.matches('.file-viewer-back, .file-viewer-page-footer .btn.primary')) ||
    (view === 'recon-action' && button.matches('.recon-popup-header .modal-cross-btn')) ||
    (view === 'mpl-source' && button.matches('.mpl-file-viewer [aria-label="Close file viewer"]'));

  if (isBackForCurrentView) {
    event.preventDefault();
    event.stopPropagation();
    window.history.back();
  }
}

export function installBrowserHistoryNavigation() {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;

  originalPushState = window.history.pushState;
  originalReplaceState = window.history.replaceState;

  const initialParams = new URLSearchParams(window.location.search);
  const initialTab = initialParams.get('tab');
  if (initialTab) {
    try { localStorage.setItem('activeTab', initialTab); } catch {}
  }

  window.history.replaceState = function patchedReplaceState(state, title, url) {
    if (!url || restoring) return originalReplaceState.call(this, state, title, url);
    try {
      const current = new URL(window.location.href);
      const next = new URL(url, current);
      const currentNav = current.searchParams.get('nav');
      const nextNav = next.searchParams.get('nav');
      const currentClient = current.searchParams.get('client');
      const nextClient = next.searchParams.get('client');
      const changesEstablishedAdminNavigation =
        current.pathname === next.pathname &&
        Boolean(currentNav && nextNav) &&
        (currentNav !== nextNav || currentClient !== nextClient);

      if (changesEstablishedAdminNavigation) {
        const result = originalPushState.call(this, { ...(state || {}), oneSmarterNav: true }, title, next.toString());
        notifyNavigation();
        return result;
      }
    } catch {}
    const result = originalReplaceState.call(this, state, title, url);
    notifyNavigation();
    return result;
  };

  document.addEventListener('click', interceptNavigationClick, true);
  window.addEventListener('popstate', restoreFromLocation);

  const initialSync = () => {
    syncTopLevelScreenFromUrl();
    const desiredView = new URLSearchParams(window.location.search).get('view') || '';
    closeViewsNotInHistory(desiredView);
    notifyNavigation();
  };
  window.setTimeout(initialSync, 0);

  return () => {
    document.removeEventListener('click', interceptNavigationClick, true);
    window.removeEventListener('popstate', restoreFromLocation);
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    installed = false;
  };
}
