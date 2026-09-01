export const PHONE_COUNTRIES = [
  { iso: 'US', name: 'United States', code: '+1', min: 10, max: 10 },
  { iso: 'CA', name: 'Canada', code: '+1', min: 10, max: 10 },
  { iso: 'IN', name: 'India', code: '+91', min: 10, max: 10, pattern: /^[6-9]/ },
  { iso: 'GB', name: 'United Kingdom', code: '+44', min: 10, max: 10 },
  { iso: 'AU', name: 'Australia', code: '+61', min: 9, max: 9 },
  { iso: 'NZ', name: 'New Zealand', code: '+64', min: 8, max: 10 },
  { iso: 'AE', name: 'United Arab Emirates', code: '+971', min: 9, max: 9 },
  { iso: 'SG', name: 'Singapore', code: '+65', min: 8, max: 8 },
  { iso: 'DE', name: 'Germany', code: '+49', min: 10, max: 11 },
  { iso: 'FR', name: 'France', code: '+33', min: 9, max: 9 },
];

export function cleanNationalNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizedNationalNumber(country, value) {
  const digits = cleanNationalNumber(value);
  return country && !['US', 'CA', 'IN', 'SG', 'AE'].includes(country.iso) && digits.startsWith('0')
    ? digits.slice(1)
    : digits;
}

export function validateNationalNumber(countryIso, value, required = true) {
  const country = PHONE_COUNTRIES.find((item) => item.iso === countryIso);
  if (!country) return 'Select a valid country code.';
  const digits = normalizedNationalNumber(country, value);
  if (!digits) return required ? 'Mobile number is required.' : '';
  if (digits.length < country.min || digits.length > country.max) {
    const expected = country.min === country.max ? `${country.min} digits` : `${country.min} to ${country.max} digits`;
    return `${country.name} mobile numbers must contain ${expected}.`;
  }
  if (country.pattern && !country.pattern.test(digits)) {
    return `${country.name} mobile numbers must start with ${country.iso === 'IN' ? '6, 7, 8, or 9' : 'a valid mobile prefix'}.`;
  }
  return '';
}

export function toE164(countryIso, value) {
  const country = PHONE_COUNTRIES.find((item) => item.iso === countryIso);
  return country ? `${country.code}${normalizedNationalNumber(country, value)}` : '';
}

export function splitE164(value, fallbackIso = 'US') {
  const normalized = String(value || '').replace(/[\s()-]/g, '');
  const matches = PHONE_COUNTRIES
    .filter((country) => normalized.startsWith(country.code))
    .sort((a, b) => b.code.length - a.code.length);
  const country = matches[0] || PHONE_COUNTRIES.find((item) => item.iso === fallbackIso) || PHONE_COUNTRIES[0];
  return {
    countryIso: country.iso,
    nationalNumber: matches[0] ? cleanNationalNumber(normalized.slice(country.code.length)) : cleanNationalNumber(normalized),
  };
}
