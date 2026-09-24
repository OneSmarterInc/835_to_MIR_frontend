import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve('src');
const nativeDialogPattern = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/g;
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const violations = [];

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(fullPath);
      continue;
    }
    if (!sourceExtensions.has(path.extname(entry.name))) continue;

    const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
    lines.forEach((line, index) => {
      nativeDialogPattern.lastIndex = 0;
      if (nativeDialogPattern.test(line)) {
        violations.push(`${path.relative(process.cwd(), fullPath)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

scan(sourceRoot);

if (violations.length) {
  console.error('Native browser dialogs are not allowed:\n' + violations.join('\n'));
  process.exit(1);
}

console.log('No native alert, confirm, or prompt calls found.');
