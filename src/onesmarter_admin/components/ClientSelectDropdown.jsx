import React from 'react';
import Select from 'react-select';

export default function ClientSelectDropdown({ clients, value, onChange, id, includeGlobal = false, fullWidth = false }) {
  const options = [
    ...(includeGlobal ? [{ value: '', label: '-- None (Global System Default) --' }] : []),
    ...clients.map(c => ({
      value: c.id,
      label: `${c.name}${c.client_code || c.code ? ` (${c.client_code || c.code})` : ''}`,
    }))
  ];
  const selectedOption = options.find(o => o.value === value) || null;

  const customStyles = {
    control: (base) => ({
      ...base,
      minHeight: '34px',
      fontFamily: 'var(--body)',
      fontSize: '14px',
      border: '1px solid var(--line)',
      borderRadius: '3px',
      background: 'var(--surface)',
      color: 'var(--ink)',
      fontWeight: 600,
      cursor: 'pointer',
      boxShadow: 'none',
      minWidth: '220px',
      '&:hover': {
        borderColor: 'var(--ink-3)'
      }
    }),
    singleValue: (base) => ({
      ...base,
      color: 'var(--ink)',
    }),
    menu: (base) => ({
      ...base,
      fontFamily: 'var(--body)',
      fontSize: '14px',
      zIndex: 9999,
      color: 'var(--ink)'
    }),
    option: (base, state) => ({
      ...base,
      background: state.isFocused ? 'rgba(0,0,0,0.05)' : 'transparent',
      color: 'var(--ink)',
      cursor: 'pointer'
    }),
    container: (base) => ({
      ...base,
      width: fullWidth ? '100%' : 'min(560px, 100%)',
      minWidth: 0,
    }),
  };

  return (
    <Select
      id={id}
      options={options}
      value={selectedOption}
      onChange={(option) => onChange(option ? option.value : '')}
      styles={customStyles}
      isSearchable={true}
      placeholder="Search client..."
    />
  );
}
