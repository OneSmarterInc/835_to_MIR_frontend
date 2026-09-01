import fs from 'node:fs';

const api = fs.readFileSync('src/utils/api.js', 'utf8');
if (!api.includes('credentials: "include"')) throw new Error('portalFetch must always include the client session cookie.');

const files = [
  'src/pages/ConversionsView.jsx',
  'src/pages/ArchiveView.jsx',
  'src/pages/ConnectionsView.jsx',
  'src/pages/ResultView.jsx',
  'src/components/FileViewerModal.jsx',
  'src/components/SftpBrowserModal.jsx',
];

for (const path of files) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes('portalFetch')) throw new Error(`${path} does not use the session-preserving API helper.`);
  if (/\bfetch\s*\(/.test(source)) throw new Error(`${path} still contains a raw fetch call.`);
}

const conversions = fs.readFileSync('src/pages/ConversionsView.jsx', 'utf8');
if (conversions.includes('VITE_API_URL')) throw new Error('Conversion requests must not bypass the current-origin session proxy.');

console.log('Client portal session request checks passed.');
