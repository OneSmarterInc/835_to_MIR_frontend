import React, { useState } from 'react';
import CenteredModal from './CenteredModal';
import { createClient } from '../../services/api';

const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'],
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];

export default function AddClientModal({ isOpen, onClose, onClientCreated, existingClients = [] }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    const trimmedAddress = address.trim();
    const trimmedZipCode = zipCode.trim();

    if (!trimmedName) {
      setErrorMsg('Client legal name is required.');
      return;
    }

    if (existingClients.some(c => c.name && c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setErrorMsg(`Duplicate client: A client named "${trimmedName}" already exists in the system.`);
      return;
    }
    if (trimmedCode && existingClients.some(c => (c.code && c.code.toLowerCase() === trimmedCode.toLowerCase()) || (c.id && c.id.toLowerCase() === trimmedCode.toLowerCase()))) {
      setErrorMsg(`Duplicate client identifier: Client code "${trimmedCode}" is already in use.`);
      return;
    }

    if (trimmedZipCode && !/^\d{5}(?:-\d{4})?$/.test(trimmedZipCode)) {
      setErrorMsg('ZIP code must contain only numbers in 12345 or 12345-6789 format.');
      return;
    }

    setLoading(true);
    try {
      const response = await createClient({
        name: trimmedName,
        code: trimmedCode || undefined,
        address: trimmedAddress || undefined,
        state: state || undefined,
        zip_code: trimmedZipCode || undefined,
      });

      await onClientCreated(response.client);
      setName('');
      setCode('');
      setAddress('');
      setState('');
      setZipCode('');
      setErrorMsg('');
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create client.');
    } finally {
      setLoading(false);
    }
  };

  const handleZipChange = (e) => {
    const value = e.target.value
      .replace(/[^0-9-]/g, '')
      .replace(/(?!^)-/g, '');
    setZipCode(value.slice(0, 10));
    setErrorMsg('');
  };

  const handleCloseModal = () => {
    setErrorMsg('');
    onClose();
  };

  return (
    <CenteredModal isOpen={isOpen} onClose={handleCloseModal}>
      <div className="modal-t">Add New Client</div>
      <p className="modal-b">Create a client record in the database and automatically generate their sequential onboarding compliance workflow.</p>
      {errorMsg && <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '6px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px', fontWeight: 500 }}>⚠️ {errorMsg}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field"><label>Client Legal Name *</label><input placeholder="e.g. Apex Health Plan, Inc." value={name} onChange={(e) => { setName(e.target.value); setErrorMsg(''); }} required autoFocus /></div>
        <div className="field"><label>Client Code / Identifier</label><input placeholder="e.g. APEXHP" value={code} onChange={(e) => { setCode(e.target.value); setErrorMsg(''); }} /></div>
        <div className="field"><label>Address</label><input placeholder="e.g. 123 Main Street" value={address} onChange={(e) => { setAddress(e.target.value); setErrorMsg(''); }} /></div>
        <div className="field"><label>ZIP Code</label><input type="text" inputMode="numeric" pattern="\d{5}(-\d{4})?" placeholder="e.g. 10001 or 10001-1234" value={zipCode} maxLength={10} onChange={handleZipChange} title="Enter a ZIP code in 12345 or 12345-6789 format" /></div>
        <div className="field"><label>State</label><select value={state} onChange={(e) => { setState(e.target.value); setErrorMsg(''); }}><option value="">Select a state</option>{US_STATES.map(([abbr, stateName]) => <option key={abbr} value={abbr}>{stateName}</option>)}</select></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}><button type="button" className="btn" onClick={handleCloseModal}>Cancel</button><button type="submit" className="btn primary" disabled={loading}>{loading ? 'Creating...' : 'Create Client'}</button></div>
      </form>
    </CenteredModal>
  );
}
