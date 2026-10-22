import { encodeDemoData } from './demoEncoder.js';

export function apiUrl(path) {
  const base = import.meta.env?.VITE_API_URL || '';
  return `${base.replace(/\/$/, '')}${path}`;
}

// XHR exposes bytes transferred; fetch cannot report request-body progress.
// Resolve every HTTP response, including errors; never replay a POST.
/**
 * @param {string} path
 * @param {{body: XMLHttpRequestBodyInit, csrfToken?: string | null, headers?: HeadersInit,
 * signal?: AbortSignal, onProgress?: (value: {stage: string, percent: number | null}) => void}} options
 * @returns {Promise<Response>}
 */
export async function uploadRequest(path, { body, csrfToken, headers = {}, signal, onProgress }) {
  if (!csrfToken) {
    const session = await fetch('/accounts/api/user/', { credentials: 'include', signal, cache: 'no-store' });
    const user = await session.json();
    if (!session.ok || !user.csrf_token) throw new Error('Unable to initialize secure upload. Please sign in again.');
    csrfToken = user.csrf_token;
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    if (signal?.aborted) { reject(new DOMException('Upload cancelled', 'AbortError')); return; }
    xhr.open('POST', apiUrl(path));
    xhr.withCredentials = true;
    xhr.timeout = 300000;
    xhr.setRequestHeader('X-CSRFToken', csrfToken);
    new Headers(headers).forEach((value, name) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = event => onProgress?.({ stage: 'uploading', percent: event.lengthComputable ? Math.round(event.loaded * 100 / event.total) : null });
    xhr.upload.onload = () => onProgress?.({ stage: 'processing', percent: 100 });
    xhr.onload = () => {
      cleanup();
      const response = new Response(xhr.responseText, { status: xhr.status, headers: { 'Content-Type': xhr.getResponseHeader('Content-Type') || 'application/json' } });
      if (!path.startsWith('/edi835/api/client-portal/analysis/')) {
        const read = response.json.bind(response);
        response.json = async () => encodeDemoData(await read());
      }
      resolve(response);
    };
    xhr.onerror = () => { cleanup(); reject(new Error('Upload connection lost. Check the receipt before retrying.')); };
    xhr.ontimeout = () => { cleanup(); reject(new Error('Processing has not been confirmed. Check the receipt before retrying.')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    onProgress?.({ stage: 'uploading', percent: 0 });
    xhr.send(body);
  });
}
