const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTER_MAP = 'PHQGIUMEAYLNOFDXJKRCVSTZWB';
const DIGIT_MAP = '3749062815';

// Demo mode only masks values that belong to the healthcare file data.
// UI labels, statuses, workflow metadata, filenames, timestamps, and technical IDs stay unchanged.
const PHI_KEY_PATTERNS = [
  /^(patient|subscriber|member|beneficiary)(_|$)/i,
  /^(claim|medical_record|account|policy|insurance|health_plan|authorization|prior_auth|encounter)(_|$)/i,
  /^(dob|birth_date|date_of_birth|service_date|service_from_date|service_to_date|admission_date|discharge_date|death_date)(_|$)/i,
  /^(name|first_name|last_name|middle_name|full_name)(_|$)/i,
  /^(address|street|street_address|city|county|zip|zipcode|postal|phone|telephone|fax|email)(_|$)/i,
  /^(ssn|social_security|mrn|member_number|member_id|subscriber_id|beneficiary_id|patient_id|account_number|policy_number)(_|$)/i,
  /^(diagnosis|procedure|service|revenue|icd|cpt|hcpcs|drg)(_|$)/i,
  /^(gender|sex|age)(_|$)/i,
];

const PHI_EXACT_KEYS = new Set([
  'patient_name',
  'patient_first_name',
  'patient_last_name',
  'patient_middle_name',
  'member_id',
  'subscriber_id',
  'beneficiary_id',
  'patient_id',
  'claim_id',
  'claim_number',
  'claim_control_number',
  'highmark_claim_number',
  'internal_claim_number',
  'medical_record_number',
  'account_number',
  'policy_number',
  'date_of_birth',
  'service_date',
  'service_from_date',
  'service_to_date',
  'admission_date',
  'discharge_date',
  'death_date',
  'address',
  'street_address',
  'city',
  'county',
  'zip',
  'zipcode',
  'postal_code',
  'phone',
  'telephone',
  'fax',
  'email',
  'ssn',
  'social_security_number',
  'diagnosis_code',
  'procedure_code',
  'revenue_code',
  'icd_code',
  'cpt_code',
  'hcpcs_code',
  'drg_code',
]);

function normalizeKey(key) {
  return String(key || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function isPhiKey(key) {
  const normalized = normalizeKey(key);
  return PHI_EXACT_KEYS.has(normalized) || PHI_KEY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function encodeDemoValue(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return value;
  const text = String(value);

  return text
    .split(/(\s+)/)
    .map((part) => part.replace(/[A-Za-z0-9]/g, (ch) => {
      if (ch >= '0' && ch <= '9') return DIGIT_MAP[Number(ch)];
      const mapped = LETTER_MAP[LETTERS.indexOf(ch.toUpperCase())];
      return ch === ch.toLowerCase() ? mapped.toLowerCase() : mapped;
    }))
    .join('');
}

export function encodeDemoData(value, key = '') {
  if (typeof window === 'undefined' || localStorage.getItem('mir-demo-substitution') !== 'true') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => encodeDemoData(item, key));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, encodeDemoData(v, k)])
    );
  }

  return isPhiKey(key) ? encodeDemoValue(value) : value;
}


function encodeX12Field(value) {
  return encodeDemoValue(value);
}

export function encodeDemoFileContent(rawContent, fileType = '') {
  if (typeof rawContent !== 'string') return rawContent;
  if (typeof window === 'undefined' || localStorage.getItem('mir-demo-substitution') !== 'true') return rawContent;

  const type = String(fileType || '').toUpperCase();
  if (!['835', '837', 'MIR', 'RECON'].includes(type)) return rawContent;

  if (type === 'MIR' || type === 'RECON') {
    return rawContent.split(/(\r?\n)/).map(part => {
      if (/^\r?\n$/.test(part)) return part;

      let line = part.replace(
        /(claim(?:_number|number)?|member(?:_id|_number)?|subscriber(?:_id|_number)?|patient(?:_id|_name)?|medical_record_number|account_number|policy_number|date_of_birth|dob|service_date|first_name|last_name|middle_name|full_name|patient_name|subscriber_name|member_name|provider_name|physician_name|doctor_name|contact_name)(\s*[:=]\s*)([^,|;\t]+)/gi,
        (_, key, separator, value) => key + separator + encodeX12Field(value)
      );

      line = line.replace(
        /^(M)(\d{15,20})([A-Z0-9]{4,20})(?=\s|$)/i,
        (_, prefix, claimNumber, internalNumber) => (
          prefix + encodeX12Field(claimNumber) + encodeX12Field(internalNumber)
        )
      );

      line = line.replace(
        /(\s)([A-Za-z][A-Za-z'’-]{1,40})(\s+)([A-Za-z][A-Za-z'’-]{1,40})(\s+)([A-Za-z])?(\s*)(\d{8})(?=\s|$)/g,
        (_, prefix, lastName, between1, firstName, between2, middleName, between3, dob) => (
          prefix +
          encodeX12Field(lastName) +
          between1 +
          encodeX12Field(firstName) +
          (middleName ? between2 + encodeX12Field(middleName) : between2) +
          between3 +
          dob
        )
      );

      return line;
    }).join('');
  }

  const segmentDelimiter = rawContent.startsWith('ISA') && rawContent.length > 105 ? rawContent[105] : '~';
  const elementDelimiter = rawContent.startsWith('ISA') ? rawContent[3] : '*';
  return rawContent.split(segmentDelimiter).map(segment => {
    if (!segment.trim()) return segment;
    const fields = segment.split(elementDelimiter);
    const tag = String(fields[0] || '').trim().toUpperCase();

    if (tag === 'CLP') {
      if (fields[1]) fields[1] = encodeX12Field(fields[1]);
    } else if (tag === 'CLM') {
      if (fields[1]) fields[1] = encodeX12Field(fields[1]);
    } else if (tag === 'N1') {
      if (fields[2]) fields[2] = encodeX12Field(fields[2]);
    } else if (tag === 'NM1') {
      [3, 4, 5, 8, 9].forEach(index => {
        if (fields[index]) fields[index] = encodeX12Field(fields[index]);
      });
    } else if (['N2', 'N3', 'N4'].includes(tag)) {
      for (let index = 1; index < fields.length; index += 1) {
        if (fields[index]) fields[index] = encodeX12Field(fields[index]);
      }
    } else if (tag === 'DMG') {
      for (let index = 2; index < fields.length; index += 1) {
        if (fields[index]) fields[index] = encodeX12Field(fields[index]);
      }
    } else if (tag === 'PER') {
      for (let index = 2; index < fields.length; index += 2) {
        if (fields[index]) fields[index] = encodeX12Field(fields[index]);
      }
    } else if (tag === 'DTP') {
      for (let index = 2; index < fields.length; index += 1) {
        if (fields[index]) fields[index] = encodeX12Field(fields[index]);
      }
    } else if (tag === 'REF') {
      for (let index = 2; index < fields.length; index += 1) {
        if (fields[index]) fields[index] = encodeX12Field(fields[index]);
      }
    }

    return fields.join(elementDelimiter);
  }).join(segmentDelimiter);
}
