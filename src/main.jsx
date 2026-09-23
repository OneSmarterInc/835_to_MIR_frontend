import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './utils/requestGovernor.js'
import './pages/NoticesViewEnhancements.css'
import './pages/ArchiveTableEnhancement.js'
import './pages/ChecksConversionEnhancement.js'
import './components/ReconciliationPageEnhancement.css'
import './components/ReconArchivePage.css'
import App from './App.jsx'
import { AppDialogProvider } from './components/AppDialog.jsx'
import ReconArchiveOverlay from './components/ReconArchiveOverlay.jsx'
import MplAnalyzeAgainAction from './components/MplAnalyzeAgainAction.jsx'
import DemoRevealLayer from './components/DemoRevealLayer.jsx'
import { installBrowserHistoryNavigation } from './utils/browserHistoryNavigation.js'
import { encodeDemoData } from './utils/demoEncoder.js'

// Global interceptor for relative API paths when hosted independently (e.g. on Vercel)
const BACKEND_URL = import.meta.env.VITE_API_URL || '';
const originalFetch = window.fetch;

window.fetch = function (url, options = {}) {
  if (typeof url === 'string') {
    const originalUrl = url;
    const isRelativeApi = url.startsWith('/api/') ||
                          url.startsWith('/accounts/') ||
                          url.startsWith('/edi835/') ||
                          url.startsWith('/admin-panel/');

    if (BACKEND_URL && isRelativeApi) {
      url = `${BACKEND_URL.replace(/\/$/, '')}${url}`;
      options.credentials = options.credentials || 'include';
    }

    const mirDownloadMatch = originalUrl.match(
      /\/admin-panel\/api\/clients\/[^/]*\/edi-files\/([^/]+)\/mir\/\?download=1/
    );

    if (BACKEND_URL && mirDownloadMatch) {
      const primaryUrl = url;
      const fileId = mirDownloadMatch[1];
      const fallbackUrl = `${BACKEND_URL.replace(/\/$/, '')}/api/download/?file_id=${encodeURIComponent(fileId)}`;

      return originalFetch(primaryUrl, options).then(async (response) => {
        if (response.ok) return response;
        return originalFetch(fallbackUrl, {
          ...options,
          credentials: options.credentials || 'include',
        });
      }).then(applyDemoEncodingToJsonResponse);
    }
  }

  return originalFetch(url, options).then(applyDemoEncodingToJsonResponse);
};


installBrowserHistoryNavigation();

const demoStorageKey = 'mir-demo-substitution';

window.addEventListener('storage', (event) => {
  if (event.key === demoStorageKey) {
    window.location.reload();
  }
});

function applyDemoEncodingToJsonResponse(response) {
  if (localStorage.getItem(demoStorageKey) !== 'true') return response;

  // File viewer endpoints must return the original file payload so the viewer
  // can build both masked and fully revealed demo representations. Encoding
  // this JSON globally first would permanently turn the source into masked
  // text, making "Reveal All" unable to restore the encoded value.
  const responsePath = (() => {
    try {
      return new URL(response.url, window.location.origin).pathname;
    } catch {
      return '';
    }
  })();
  if (/\/api\/file-content\//.test(responsePath)) return response;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return response;

  const originalJson = response.clone().json();
  let encodedPromise = null;

  response.json = () => {
    if (!encodedPromise) {
      encodedPromise = originalJson.then((data) => encodeDemoData(data));
    }
    return encodedPromise;
  };

  return response;
}


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppDialogProvider>
      <App />
      <ReconArchiveOverlay />
      <MplAnalyzeAgainAction />
      <DemoRevealLayer />
    </AppDialogProvider>
  </StrictMode>,
)
//test