import React from 'react';
import { cleanNationalNumber, PHONE_COUNTRIES, validateNationalNumber } from '../utils/phone';

export default function PhoneNumberField({ countryIso, onCountryChange, value, onChange, required = true, error = '', label = 'Mobile Number' }) {
  const validationError = error || validateNationalNumber(countryIso, value, required);
  return (
    <div className="field">
      {label && <label>{label}{required ? ' *' : ''}</label>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(145px, 0.45fr) minmax(150px, 1fr)', gap: 8 }}>
        <select aria-label="Country code" value={countryIso} onChange={(event) => onCountryChange(event.target.value)}>
          {PHONE_COUNTRIES.map((country) => <option key={country.iso} value={country.iso}>{country.iso} {country.code}</option>)}
        </select>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          aria-label="Mobile number"
          placeholder="Mobile number"
          value={value}
          onChange={(event) => onChange(cleanNationalNumber(event.target.value))}
          required={required}
        />
      </div>
      {validationError && value && <div className="error-msg" style={{ marginTop: 5 }}>{validationError}</div>}
    </div>
  );
}
