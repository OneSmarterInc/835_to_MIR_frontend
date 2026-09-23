const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTER_MAP = 'PHQGIUMEAYLNOFDXJKRCVSTZWB';
const DIGIT_MAP = '3749062815';

// Fields used for navigation, matching, and API lookups must never be masked.
const PASSTHROUGH_KEYS = new Set([
  'id',
  'file_id',
  'filing_id',
  'conversion_id',
  'mir_id',
  'claim_id',
  'claim_number',
  'claim_control_number',
  'internal_claim_number',
  'highmark_claim_number',
  'record_id',
  'client_id',
  'user_id',
  'uuid',
  'pk',
  'url',
  'path',
  'download_url',
  'source_file',
  'filename'
]);

export function encodeDemoValue(value) {
  if (typeof value !== 'string') return value;

  return value.replace(/[A-Za-z0-9]/g, (ch) => {
    if (ch >= '0' && ch <= '9') return DIGIT_MAP[Number(ch)];

    const mapped = LETTER_MAP[LETTERS.indexOf(ch.toUpperCase())];
    return ch === ch.toLowerCase() ? mapped.toLowerCase() : mapped;
  });
}

export function encodeDemoData(value, key = '') {
  if (!JSON.parse(localStorage.getItem('mir-demo-substitution') || 'false')) {
    return value;
  }

  if (PASSTHROUGH_KEYS.has(key.toLowerCase())) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => encodeDemoData(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        encodeDemoData(v, k)
      ])
    );
  }

  return encodeDemoValue(value);
}
