import React, { useEffect, useMemo, useState } from 'react';

import TimeDisplay from '../../components/TimeDisplay';
import { fetchAuditLogs } from '../services/api';
import './AuditLogView.css';

const INITIAL_FILTERS = { search: '', client_id: '', module: '', action: '', performed_by: '', date_from: '', date_to: '' };

function renderDetails(details) {
  if (!details) return '—';
  const match = details.match(/^(.*?) changed from '(.*?)' to '(.*?)'(.*)$/i);
  if (!match) return details;
  const [, prefix, oldValue, newValue, suffix] = match;
  return <span>{prefix} <span className="audit-old-value">{oldValue}</span><span className="audit-new-value">{newValue}</span>{suffix}</span>;
}

export default function AuditLogView({ clients = [] }) {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState('timestamp');
  const [direction, setDirection] = useState('desc');
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: 25, total_count: 0, total_pages: 1 });
  const [options, setOptions] = useState({ modules: [], actions: [], performed_by: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchAuditLogs({ ...filters, page, page_size: pageSize, sort, direction });
        if (!active) return;
        setLogs(data.logs || []);
        setPagination(data.pagination || { page: 1, page_size: pageSize, total_count: 0, total_pages: 1 });
        setOptions(data.filter_options || { modules: [], actions: [], performed_by: [] });
        if (data.pagination?.page && data.pagination.page !== page) setPage(data.pagination.page);
      } catch (requestError) {
        if (active) setError(requestError.message || 'Failed to load audit logs.');
      } finally {
        if (active) setLoading(false);
      }
    }, filters.search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [filters, page, pageSize, sort, direction]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
  };

  const changeSort = (field) => {
    if (sort === field) setDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else { setSort(field); setDirection('asc'); }
    setPage(1);
  };

  const sortIcon = (field) => sort === field ? (direction === 'asc' ? '▲' : '▼') : '⇅';
  const hasFilters = Object.values(filters).some(Boolean);
  const firstRow = pagination.total_count ? ((pagination.page - 1) * pagination.page_size) + 1 : 0;
  const lastRow = Math.min(pagination.page * pagination.page_size, pagination.total_count);
  const visiblePages = useMemo(() => {
    const total = Math.max(1, pagination.total_pages || 1);
    const start = Math.max(1, Math.min(page - 2, total - 4));
    return Array.from({ length: Math.min(5, total) }, (_, index) => start + index);
  }, [page, pagination.total_pages]);

  return <section className="view on audit-view" id="v-audit">
    <div className="hdr-row">
      <div><div className="eyebrow">Append Only Audit</div><h1>Audit Log</h1><p className="sub">Search and review the complete immutable history of client and administrative activity.</p></div>
    </div>

    <div className="card audit-filter-card">
      <div className="audit-search-row">
        <label className="audit-search"><span>Universal search</span><input type="search" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search time, client, user, module, action, or details…" aria-label="Search every value in the complete audit log" /></label>
        <div className="audit-count" aria-live="polite"><b>{pagination.total_count.toLocaleString()}</b><span>matching events</span></div>
        <button type="button" className="btn-gray" onClick={clearFilters} disabled={!hasFilters}>Clear filters</button>
      </div>
      <div className="audit-filter-grid">
        <label><span>Client</span><select value={filters.client_id} onChange={(event) => updateFilter('client_id', event.target.value)}><option value="">All clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label><span>Module</span><select value={filters.module} onChange={(event) => updateFilter('module', event.target.value)}><option value="">All modules</option>{options.modules.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
        <label><span>Action</span><select value={filters.action} onChange={(event) => updateFilter('action', event.target.value)}><option value="">All actions</option>{options.actions.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
        <label><span>Performed by</span><select value={filters.performed_by} onChange={(event) => updateFilter('performed_by', event.target.value)}><option value="">All users</option>{options.performed_by.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>From date</span><input type="date" value={filters.date_from} onChange={(event) => updateFilter('date_from', event.target.value)} /></label>
        <label><span>To date</span><input type="date" value={filters.date_to} min={filters.date_from || undefined} onChange={(event) => updateFilter('date_to', event.target.value)} /></label>
      </div>
    </div>

    {error && <div className="audit-error">{error}</div>}
    <div className="audit-table-toolbar"><span>{loading ? 'Loading audit events…' : `Showing ${firstRow.toLocaleString()}–${lastRow.toLocaleString()} of ${pagination.total_count.toLocaleString()}`}</span></div>
    <div className={`card audit-table-card${loading ? ' loading' : ''}`}>
      <div className="audit-table-wrap">
        <table className="audit-table"><thead><tr>
          {[['timestamp', 'When'], ['module', 'Module'], ['action', 'Action'], ['client', 'Client']].map(([field, label]) => <th key={field}><button type="button" onClick={() => changeSort(field)}>{label} <span>{sortIcon(field)}</span></button></th>)}
          <th>Details</th><th><button type="button" onClick={() => changeSort('performed_by')}>Performed by <span>{sortIcon('performed_by')}</span></button></th>
        </tr></thead><tbody>
          {!loading && logs.length === 0 ? <tr><td colSpan="6" className="audit-empty"><b>No audit events found</b><span>Adjust or clear the filters to view more activity.</span></td></tr> : logs.map((log) => <tr key={log.id}>
            <td className="audit-when"><TimeDisplay value={log.timestamp} includeSeconds easternOnly /></td>
            <td><button type="button" className="tag audit-filter-tag" onClick={() => updateFilter('module', log.module || 'SYSTEM')}>{log.module || 'SYSTEM'}</button></td>
            <td><button type="button" className="tag ok audit-filter-tag" onClick={() => updateFilter('action', log.action)}>{log.action}</button></td>
            <td><button type="button" className="audit-client-link" onClick={() => log.client_id && updateFilter('client_id', log.client_id)} disabled={!log.client_id}>{log.client_name || log.client || 'System'}</button></td>
            <td className="audit-details">{renderDetails(log.details)}</td>
            <td><button type="button" className="audit-actor-link" onClick={() => updateFilter('performed_by', log.performed_by || '')}>{log.performed_by || 'Admin User'}</button></td>
          </tr>)}
        </tbody></table>
      </div>
      <div className="audit-table-footer"><label>Rows per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div>
    </div>

    {pagination.total_pages > 1 && <nav className="audit-pagination" aria-label="Audit log pages">
      <button type="button" onClick={() => setPage(1)} disabled={page <= 1}>First</button><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Previous</button>
      {visiblePages.map((number) => <button type="button" key={number} className={number === page ? 'active' : ''} aria-current={number === page ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>)}
      <button type="button" onClick={() => setPage((value) => Math.min(pagination.total_pages, value + 1))} disabled={page >= pagination.total_pages}>Next</button><button type="button" onClick={() => setPage(pagination.total_pages)} disabled={page >= pagination.total_pages}>Last</button>
    </nav>}
  </section>;
}
