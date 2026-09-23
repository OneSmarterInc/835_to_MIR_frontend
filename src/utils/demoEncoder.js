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
  /^(diagnosis|procedure|service|revenue|icd|cpt|hcpcs|drg|charge|allowed|paid|payment|deductible|copay|coinsurance|patient_responsibility|amount_to_pay|remaining_amount|recon_paid_amount|difference_amount)(_|$)/i,
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
