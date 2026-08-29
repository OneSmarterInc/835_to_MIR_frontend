import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Global interceptor for relative API paths when hosted independently (e.g. on Vercel)
const BACKEND_URL = import.meta.env.VITE_API_URL || '';
if (BACKEND_URL) {
  const originalFetch = window.fetch;
  window.fetch = function (url, options = {}) {
    if (typeof url === 'string') {
      const originalUrl = url;
      const isRelativeApi = url.startsWith('/api/') ||
                            url.startsWith('/accounts/') ||
                            url.startsWith('/edi835/') ||
                            url.startsWith('/admin-panel/');

      if (isRelativeApi) {
        url = `${BACKEND_URL.replace(/\/$/, '')}${url}`;
        options.credentials = options.credentials || 'include';
      }

      const mirDownloadMatch = originalUrl.match(
        /\/admin-panel\/api\/clients\/[^/]*\/edi-files\/([^/]+)\/mir\/\?download=1/
      );

      if (mirDownloadMatch) {
        const primaryUrl = url;
        const fileId = mirDownloadMatch[1];
        const fallbackUrl = `${BACKEND_URL.replace(/\/$/, '')}/api/download/?file_id=${encodeURIComponent(fileId)}`;

        return originalFetch(primaryUrl, options).then(async (response) => {
          if (response.ok) return response;
          return originalFetch(fallbackUrl, {
            ...options,
            credentials: options.credentials || 'include',
          });
        });
      }
    }

    return originalFetch(url, options);
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
//test
