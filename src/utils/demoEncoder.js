const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTER_MAP = 'PHQGIUMEAYLNOFDXJKRCVSTZWB';
const DIGIT_MAP = '3749062815';

export function encodeDemoValue(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/[A-Za-z0-9]/g, (ch) => {
    if (ch >= '0' && ch <= '9') return DIGIT_MAP[Number(ch)];
    const mapped = LETTER_MAP[LETTERS.indexOf(ch.toUpperCase())];
    return ch === ch.toLowerCase() ? mapped.toLowerCase() : mapped;
  });
}

export function encodeDemoData(value) {
  if (!JSON.parse(localStorage.getItem('mir-demo-substitution') || 'false')) return value;

  if (Array.isArray(value)) return value.map(encodeDemoData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeDemoData(v)]));
  }
  return encodeDemoValue(value);
}
