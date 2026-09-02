import fs from 'node:fs';

const source = fs.readFileSync('src/components/FileViewerModal.jsx', 'utf8');

if (!source.includes('portalFetch')) {
  throw new Error('The file viewer must preserve session authentication.');
}
if (!source.includes('onesmarter_admin_token') || !source.includes('Authorization')) {
  throw new Error('The file viewer must include administrator token authentication.');
}
if (!source.includes('data.error || "Could not retrieve file content"')) {
  throw new Error('The file viewer must display the backend access error.');
}

console.log('File viewer authentication regression checks passed.');
