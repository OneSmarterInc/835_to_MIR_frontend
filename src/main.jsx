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
      const isRelativeApi = url.startsWith('/api/') || 
                            url.startsWith('/accounts/') || 
                            url.startsWith('/edi835/') || 
                            url.startsWith('/admin-panel/');
      if (isRelativeApi) {
        url = `${BACKEND_URL.replace(/\/$/, '')}${url}`;
        options.credentials = options.credentials || 'include';
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
