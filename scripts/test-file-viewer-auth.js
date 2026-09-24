import fs from 'node:fs';
import path from 'node:path';

const viewerSource = fs.readFileSync('src/components/FileViewerModal.jsx', 'utf8');

if (!viewerSource.includes('portalFetch')) {
  throw new Error('The file viewer must preserve Django session authentication.');
}
if (!viewerSource.includes('data.error || "Could not retrieve file content"')) {
  throw new Error('The file viewer must display the backend access error.');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const credentialPattern = /localStorage\.(?:getItem|setItem)\(\s*['"]onesmarter_admin_token['"]/;
for (const filePath of walk('src')) {
  if (!/\.(?:js|jsx|ts|tsx)$/.test(filePath)) continue;
  const source = fs.readFileSync(filePath, 'utf8');
  if (credentialPattern.test(source)) {
    throw new Error(`${filePath} must rely on the Django session cookie, not a browser-stored administrator token.`);
  }
}

console.log('Admin frontend session-authentication regression checks passed.');
