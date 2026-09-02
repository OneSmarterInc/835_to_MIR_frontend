import React, { useState, useEffect } from 'react';
import { fetchAccessInfo, fetchClients, createUser, updateUser, deleteUser, grantClientAccess, revokeClientAccess } from '../services/api';
import CreateUserModal from './modals/CreateUserModal';
import EditUserModal from './modals/EditUserModal';
import UserDetailsModal from './modals/UserDetailsModal';
import TimeDisplay from '../../components/TimeDisplay';
import { showAppAlert, showAppConfirm } from '../../components/AppDialog';
import { isAdministrativeAccount, isSuperAdminAccount } from '../utils/adminRoles';

export default function AccessView({ currentUser }) {
  const [accessData, setAccessData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState(null);
  const [clients, setClients] = useState([]);
  
  // Sorting state
  const [sortField, setSortField] = useState('person');
  const [sortDirection, setSortDirection] = useState('asc');

  useEffect(() => {
    loadAccess();
    loadClients();
  }, []);

  async function loadClients() {
    try {
      const data = await fetchClients();
      const list = data.clients || data.results || (Array.isArray(data) ? data : []);
      setClients(list.filter((client) => String(client.stage || '').toLowerCase() !== 'offboarded'));
    } catch (err) {
      console.error("Failed to fetch clients", err);
    }
  }

  async function loadAccess() {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchAccessInfo();
      setAccessData(data);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load access information');
    } finally {
      setLoading(false);
    }
  }

  const isSuperAdmin = isSuperAdminAccount(currentUser);

  const handleCreateUser = async (userData) => {
    if ((userData.role === 'Admin' || userData.role === 'Super Admin') && !isSuperAdmin) {
      await showAppAlert("Standard Admins cannot create Admin or Super Admin accounts.", { title: 'Access Denied', tone: 'error' });
      return;
    }
    await createUser(userData);
    setShowCreateModal(false);
    loadAccess();
  };

  const handleEditUser = async (userId, updatedData) => {
    const targetUser = accessData?.staff?.find(u => u.id === userId);
    const targetIsAdmin = isAdministrativeAccount(targetUser);
    const tryingToPromote = updatedData.role === 'Admin' || updatedData.role === 'Super Admin';

    if ((targetIsAdmin || tryingToPromote) && !isSuperAdmin) {
      await showAppAlert("Standard Admins cannot modify Admin/Super Admin roles or accounts.", { title: 'Access Denied', tone: 'error' });
      return;
    }
    await updateUser(userId, updatedData);
    setShowEditModal(false);
    loadAccess();
  };

  const handleDeleteUser = async (member) => {
    const isTargetAdmin = isAdministrativeAccount(member);
    if (isTargetAdmin && !isSuperAdmin) {
      await showAppAlert("Standard Admins cannot delete Admin or Super Admin accounts.", { title: 'Access Denied', tone: 'error' });
      return;
    }
    const isCurrentUser = member.email === currentUser?.email;
    const confirmMsg = isCurrentUser
      ? `WARNING: You are about to delete your own administrative account (${member.email}). Are you sure you want to proceed?`
      : `Are you sure you want to delete the ${member.role.toLowerCase()} account (${member.email})?`;
      
    if (await showAppConfirm(confirmMsg, {
      title: isCurrentUser ? 'Delete Your Account?' : 'Delete Account?',
      confirmLabel: 'Delete Account',
      danger: true,
      tone: 'error',
    })) {
      try {
        setLoading(true);
        await deleteUser(member.id);
        loadAccess();
      } catch (err) {
        setErrorMessage(err.message || 'Failed to delete user.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleScreenPermissions = async (member, adminScreens) => {
    if (!isSuperAdmin || member.role !== 'Admin') return;
    await updateUser(member.id, { admin_screens: adminScreens });
    setSelectedUser((current) => ({ ...current, admin_screens: adminScreens }));
    await loadAccess();
  };

  const handleGrantClientAccess = async (member, grant) => {
    await grantClientAccess({ user_id: member.id, ...grant });
    await loadAccess();
  };

  const handleRevokeClientAccess = async (grantId) => {
    await revokeClientAccess(grantId);
    await loadAccess();
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) return <span style={{ marginLeft: '4px', opacity: 0.3, fontSize: '10px' }}>â‡…</span>;
    return sortDirection === 'asc' 
      ? <span style={{ marginLeft: '4px', color: 'var(--teal)', fontSize: '10px' }}>â–²</span>
      : <span style={{ marginLeft: '4px', color: 'var(--teal)', fontSize: '10px' }}>â–¼</span>;
  };

  const getSortedMembers = () => {
    if (!accessData || !accessData.staff) return [];
    const members = [...accessData.staff];
    if (!sortField) return members;

    return members.sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortField === 'person') {
        valA = a.person || '';
        valB = b.person || '';
      } else if (sortField === 'email') {
        valA = a.email || '';
        valB = b.email || '';
      } else if (sortField === 'role') {
        valA = a.role || '';
        valB = b.role || '';
      } else if (sortField === 'mobile') {
        valA = a.mobile || '';
        valB = b.mobile || '';
      } else if (sortField === 'client') {
        valA = (a.clients && a.clients[0]) || '';
        valB = (b.clients && b.clients[0]) || '';
      }

      valA = valA.toString().toLowerCase();
      valB = valB.toString().toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const sortedMembers = getSortedMembers();

  return (
    <section className="view on table-screen" id="v-access">
      <div className="hdr-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>Access Matrix</h1>
          <p className="sub">Administrative staff role-based access and break-glass logging.</p>
        </div>
        <button className="btn primary" onClick={() => setShowCreateModal(true)}>
          + Create User
        </button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="v">{accessData?.current_admin?.name || currentUser?.name || 'admin'}</div>
          <div className="l">Current Admin</div>
          <div className="d">{accessData?.current_admin?.role || currentUser?.role || 'Admin'}</div>
        </div>
        <div className="metric">
          <div className="v" style={{ fontSize: '18px' }}>
            {accessData?.last_login ? <TimeDisplay value={accessData.last_login} easternOnly /> : accessData ? 'Never' : 'Loading...'}
          </div>
          <div className="l">Last Login (EST)</div>
          <div className="d">Dynamic database record</div>
        </div>
        <div className="metric">
          <div className="v" style={{ fontSize: '18px' }}>
            {accessData?.current_admin?.mfa_status || (accessData ? 'Password Only' : 'Loading...')}
          </div>
          <div className="l">MFA Status</div>
          <div className="d">{accessData?.current_admin?.mfa_desc || 'Dynamic verification'}</div>
        </div>
        <div className="metric">
          <div className="v">{accessData?.current_admin?.session_state || 'Active'}</div>
          <div className="l">Session State</div>
        </div>
      </div>

      {errorMessage && (
        <div className="note" style={{ background: 'var(--brick-bg)', borderColor: 'var(--brick)', color: 'var(--brick)' }}>
          <b>Error:</b> {errorMessage}
        </div>
      )}

      {loading && !accessData ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-3)' }}>
          Loading access controls &amp; login logs...
        </div>
      ) : (
        <>
          <h2 className="sec">Administrative Staff Access</h2>
          <div className="admin-table-scroll">
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th onClick={() => handleSort('person')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Person {renderSortIcon('person')}
                </th>
                <th onClick={() => handleSort('email')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Email {renderSortIcon('email')}
                </th>
                <th onClick={() => handleSort('role')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Role {renderSortIcon('role')}
                </th>
                <th onClick={() => handleSort('mobile')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Mobile {renderSortIcon('mobile')}
                </th>
                <th onClick={() => handleSort('client')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Client {renderSortIcon('client')}
                </th>
                <th>MFA Status</th>
                <th>Last Login (EST)</th>
                <th>Status</th>
                <th style={{ textAlign: 'center', width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((member, idx) => (
                <tr key={member.id || idx}>
                  <td>
                    <b 
                      style={{ cursor: 'pointer', color: 'var(--teal)', textDecoration: 'underline' }} 
                      onClick={() => { setSelectedUser(member); setShowDetailsModal(true); }}
                      title="View user details"
                    >
                      {member.person}
                    </b>
                  </td>
                  <td><span style={{ fontSize: '12.5px', fontFamily: 'monospace' }}>{member.email}</span></td>
                  <td>{member.role}</td>
                  <td>{member.mobile || 'â€”'}</td>
                  <td>
                    {(member.clients || []).length > 0 
                      ? member.clients.join(', ')
                      : 'None'}
                  </td>
                  <td>
                    <span className={`tag ${member.mfa === 'Enabled' ? 'ok' : 'err'}`}>
                      {member.mfa}
                    </span>
                  </td>
                  <td className="num" style={{ minWidth: '210px' }}><TimeDisplay value={member.last_login} easternOnly /></td>
                  <td><span className="tag ok">{member.status}</span></td>
                  <td style={{ textAlign: 'center' }}>
                    {(isAdministrativeAccount(member) && !isSuperAdmin) ? (
                      <span style={{ color: 'var(--ink-3)', fontSize: '12px' }} title="Admins cannot manage other Admins/Super Admins">ðŸ”’</span>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button 
                          className="btn icon-btn" 
                          title="Edit Account"
                          onClick={() => {
                            setSelectedUser({
                              ...member,
                              client_id: clients.find(c => c.name === member.clients?.[0])?.id || ''
                            });
                            setShowEditModal(true);
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                        >
                          <svg width="15" height="15" fill="var(--teal)" viewBox="0 0 16 16">
                            <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      <CreateUserModal
      =÷Íí¢G§²ÚîÆ­yÜ™Ø˜XÚÙÜ›Ý[™˜\ŠK\Ý\™˜XÙJNØ›Ü™\ŽŒ\ÛÛY˜\ŠK[[™JNÜY[™ÎŒMœMÜB‹˜Ø\™žÙ›Û\Ú^™NŒLÜÛX\™Ú[ŽŒÜÙ›Û]ÙZYÚŒB‹˜Ø\™Ù›Û\Ú^™NŒL‹\ØÛÛÜŽ˜\ŠKZ[šËLŠNÛX\™Ú[ŽŽ\B‹šÝžÙ\Ü^N™›^Ú\ÝYžKXÛÛ[œÜXÙKX™]ÙY[ŽÙØ\ŒLœÜY[™Î\Ø›Ü™\‹X›ÝÛNŒ\ÛÛY˜\ŠK[[™K\ÛÙ
NÙ›Û\Ú^™NŒL‹\B‹šÝŽ›\ÝXÚ[Ø›Ü™\‹X›ÝÛN››Û™_B‹šÝˆšÞØÛÛÜŽ˜\ŠKZ[šËLÊ_B‹šÝˆžÙ›ÛY˜[Z[N˜\ŠKY\Ü^JNÙ›Û]˜\šX[[[Y\šXÎX[\‹[[\ßBX›^ÝÚYŒL	NØ›Ü™\‹XÛÛ\ÙN˜ÛÛ\ÙNØ˜XÚÙÜ›Ý[™˜\ŠK\Ý\™˜XÙJNØ›Ü™\ŽŒ\ÛÛY˜\ŠK[[™J_BÙ›ÛY˜[Z[N˜\ŠKY\Ü^JNÙ›Û\Ú^™NŒLÛ]\‹\ÜXÚ[™Î‹ŒLÙ[NÝ^]˜[œÙ›Ü›N\\˜Ø\ÙNØÛÛÜŽ˜\ŠKZ[šËLÊNÝ^X[YÛŽ›YÜY[™ÎŒL\MØ›Ü™\‹X›ÝÛNŒ\ÛÛY˜\ŠK[[™JNÙ›Û]ÙZYÚŒØ˜XÚÙÜ›Ý[™ˆÑQ‘‘BÜY[™ÎŒLœMØ›Ü™\‹X›ÝÛNŒ\ÛÛY˜\ŠK[[™K\ÛÙ
NÙ›Û\Ú^™NŒL‹\Ý™\XØ[X[YÛŽ›ZY_B›ÙHŽ›\ÝXÚ[Ø›Ü™\‹X›ÝÛN››Û™_B›[^Ù›ÛY˜[Z[N˜\ŠKY\Ü^JNÙ›Û]˜\šX[[[Y\šXÎX[\‹[[\ßB‹˜ÛXÚØX›H›ÙHžØÝ\œÛÜŽœÚ[\ŸB‹˜ÛXÚØX›H›ÙHŽšÝ™\žØ˜XÚÙÜ›Ý[™˜\ŠK\\\Š_B‹˜ÛXÚØX›H›ÙH‹œÙ[Ø˜XÚÙÜ›Ý[™˜\ŠK[ØÚ™KX™Ê_B‹YÞÙ\Ü^Nš[›[™KX›ØÚÎÙ›ÛY˜[Z[N˜\ŠKY\Ü^JNÙ›Û\Ú^™NŒLÛ]\‹\ÜXÚ[™Î‹Œ[NÝ^]˜[œÙ›Ü›N\\˜Ø\ÙNÜY[™ÎŒœÜØ›Ü™\‹\˜Y]\ÎŒœÝÚ]K\ÜXÙN››ÝÜ˜\B‹YË›ÚÞØ˜XÚÙÜ›Ý[™˜\ŠK]X[X™ÊNØÛÛÜŽ˜\ŠK]X[
_B‹YËÛÜšÞØ˜XÚÙÜ›Ý[™˜\ŠK[ØÚ™KX™ÊNØÛÛÜŽ˜\ŠK[ØÚ™J_B‹YË˜˜YØ˜XÚÙÜ›Ý[™˜\ŠKXœšXÚËX™ÊNØÛÛÜŽ˜\ŠKXœšXÚÊ_B‹YËšY^Ø˜XÚÙÜ›Ý[™˜\ŠK\\\ŠNØÛÛÜŽ˜\ŠKZ[šËLÊ_B‹YË˜›Y^Ø˜XÚÙÜ›Ý[™˜\ŠKX›YKX™ÊNØÛÛÜŽ˜\ŠKX›YJ_B‹YËœ\œ^Ø˜XÚÙÜ›Ý[™ˆÑŒÑN‘ŽØÛÛÜŽˆÍÑLŒÑ_B‹YË˜[X™\žØ˜XÚÙÜ›Ý[™ˆÑ‘QŒÐÍÎØÛÛÜŽˆÐLÌ_B‹YËš[™YÛÞØ˜XÚÙÜ›Ý[™ˆÑQQŒ‘‘ŽØÛÛÜŽˆÍÌÎÐ_B‹˜žØ›Ü™\ŽŒ\ÛÛY˜\ŠK[[™JNØ˜XÚÙÜ›Ý[™˜\ŠK\Ý\™˜XÙJNÜY[™ÎœLœÙ›Û\Ú^™NŒL‹\Ø›Ü™\‹\˜Y]\ÎŒœÙ\Ü^Nš[›[™KY›^Ø[YÛ‹Z][\Î˜Ù[\ŽÙØ\œB‹˜ŽšÝ™\žØ›Ü™\‹XÛÛÜŽ˜\ŠKZ[šËLŠ_B‹˜‹œš[X\ž^Ø˜XÚÙÜ›Ý[™˜\ŠKZ[šÊNØÛÛÜŽˆÙ™™ŽØ›Ü™\‹XÛÛÜŽ˜\ŠKZ[šÊ_B‹˜‹œš[X\žNšÝ™\žØ˜XÚÙÜ›Ý[™ˆÌLMÌB‹˜‹œÝXØÙ\ÜÞØ˜XÚÙÜ›Ý[™˜\ŠK]X[
NØÛÛÜŽˆÙ™™ŽØ›Ü™\‹XÛÛÜŽ˜\ŠK]X[
_B‹˜‹œÝXØÙ\ÜÎšÝ™\žØ˜XÚÙÜ›Ý[™ˆÌN_B‹˜‹™[™Ù\žØ›Ü™\‹XÛÛÜŽ˜\ŠKXœšXÚÊNØÛÛÜŽ˜\ŠKXœšXÚÊ_B‹˜‹›Z[š^ÝÚYŒÌÚZYÚŒÌÜY[™ÎŒÚ\ÝYžKXÛÛ[˜Ù[\ŸB‹˜‹[ž^ÜY[™ÎÙ›Û\Ú^™NŒL\Ù›ÛY˜[Z[N˜\ŠKY\Ü^J_B‹˜‹šXÛÛ‹XˆÂˆÚYˆÌœÂˆZYÚˆÌœÂˆY[™ÎˆÂˆ\Ü^Nˆ[›[™KY›^Âˆ[YÛ‹Z][\ÎˆÙ[\ŽÂˆ\ÝYžKXÛÛ[ˆÙ[\ŽÂˆ›Ü™\‹\˜Y]\ÎˆœÂˆ›Ü™\Žˆ\ÛÛY˜\ŠK[[™K\ÛÙ
NÂˆ˜XÚÙÜ›Ý[™ˆ˜\ŠK\Ý\™˜XÙJNÂˆÝ\œÛÜŽˆÚ[\ŽÂˆÛÛÜŽˆ˜\ŠKZ[šÊNÂˆ˜[œÚ][ÛŽˆ˜[œÙ›Ü›HŒM\ÈX\ÙK˜XÚÙÜ›Ý[™ŒM\ÈX\ÙK›Ü™\‹XÛÛÜˆŒM\ÈX\ÙK›Þ\ÚYÝÈŒM\ÈX\ÙNÂŸB‹˜‹šXÛÛ‹XŽšÝ™\ˆÂˆ˜[œÙ›Ü›Nˆ˜[œÛ]VJL\
NÂˆ›Þ\ÚYÝÎˆœœ™Ø˜JŒ
NÂˆ›Ü™\‹XÛÛÜŽˆ˜\ŠK[[™JNÂŸB‹˜‹šXÛÛ‹X‹šY]ËXˆÂˆ›Ü™\‹XÛÛÜŽˆÙYLYYÂˆ˜XÚÙÜ›Ý[™ˆÙ™™™™™ŽÂŸB‹˜‹šXÛÛ‹X‹šY]ËXŽšÝ™\ˆÂˆ›Ü™\‹XÛÛÜŽˆ˜\ŠKZ[šËLŠNÂˆ˜XÚÙÜ›Ý[™ˆÙ˜Y˜™˜ÎÂŸB‹˜‹šXÛÛ‹X‹™ÝÛ›ØYXˆÂˆ›Ü™\‹XÛÛÜŽˆÙ™MLÂˆ˜XÚÙÜ›Ý[™ˆÙ™™™™™ŽÂŸB‹˜‹šXÛÛ‹X‹™ÝÛ›ØYXŽšÝ™\ˆÂˆ›Ü™\‹XÛÛÜŽˆ˜\ŠK]X[
NÂˆ˜XÚÙÜ›Ý[™ˆÙ˜YŽÂŸB‹˜‹šXÛÛ‹X‹\ØYXˆÂˆ›Ü™\‹XÛÛÜŽˆÙYLYYÂˆ˜XÚÙÜ›Ý[™ˆÙ™™™™™ŽÂŸB‹˜‹šXÛÛ‹X‹\ØYXŽšÝ™\ˆÂˆ›Ü™\‹XÛÛÜŽˆ˜\ŠKX›YJNÂˆ˜XÚÙÜ›Ý[™ˆÙYŽY˜ÎÂŸB‹˜‹šXÛÛ‹X‹\ØYX‹™Û™HÂˆ›Ü™\‹XÛÛÜŽˆÙ™MLÂŸB‹˜‹šXÛÛ‹X‹\ØYX‹™Û™NšÝ™\ˆÂˆ›Ü™\‹XÛÛÜŽˆ˜\ŠK]X[
NÂˆ˜XÚÙÜ›Ý[™ˆÙ˜YŽÂŸB‹˜‹šXÛÛ‹X‹››Ý\ËXˆÂˆ›Ü™\‹XÛÛÜŽˆÙYLÙNÂˆ˜XÚÙÜ›Ý[™ˆÙ™™™™™ŽÂŸB‹˜‹šXÛÛ‹X‹››Ý\ËXŽšÝ™\ˆÂˆ›Ü™\‹XÛÛÜŽˆ˜\ŠK[ØÚ™JNÂˆ˜XÚÙÜ›Ý[™ˆÙ™˜YNÂŸB‹˜‹šXÛÛ‹X‹œ™YËXˆÂˆ›Ü™\‹XÛÛÜŽˆÙŒ™ÙNÂˆ˜XÚÙÜ›Ý[™ˆÙ™™™™™ŽÂŸB‹˜‹šXÛÛ‹X‹œ™YËXŽšÝ™\ˆÂˆ›Ü™\‹XÛÛÜŽˆ˜\ŠKXœšXÚÊNÂˆ˜XÚÙÜ›Ý[™ˆÙ™YÂŸB‹˜Ž™\ØX›YÂˆÜXÚ]NˆNÂˆÝ\œÛÜŽˆ›ÝX[ÝÙYÂŸBÙ^Yœ˜[Y\ÈÜ[žÌ	^Ý˜[œÙ›Ü›Nœ›Ý]JYÊ_LL	^Ý˜[œÙ›Ü›Nœ›Ý]JÍŒYÊ__B‹œÜ[›™\‹ZXÛÛžÙ\Ü^Nš[›[™KX›ØÚÎÝÚYŒL\ÚZYÚŒL\Ø›Ü™\ŽŒœÛÛY™Ø˜JMKMKMKŒÍJNØ›Ü™\‹]ÜXÛÛÜŽˆÙ™™ŽØ›Ü™\‹\˜Y]\ÎL	NØ[š[X][ÛŽœÜ[ˆÍ\È[™X\ˆ[™š[š]NÙ›^\Úš[šÎŒB‹œÝXžÛX\™Ú[‹]ÜŒØ›Ü™\ŽŒ\\ÚY˜\ŠK[[™JNÜY[™ÎŒMMœÙ›Û\Ú^™NŒL‹\ØÛÛÜŽ˜\ŠKZ[šËLŠNØ˜XÚÙÜ›Ý[™˜\ŠK\Ý\™˜XÙJ_B‹œÝXˆžØÛÛÜŽ˜\ŠKZ[šÊNÙ›Û]ÙZYÚŒB‹››Ý^Ø˜XÚÙÜ›Ý[™˜\ŠK[ØÚ™KX™ÊNØ›Ü™\‹[YŒÜÛÛY˜\ŠK[ØÚ™JNÜY[™ÎŒL\LÜÙ›Û\Ú^™NŒL‹\ÛX\™Ú[ŽŒMB‹™ÛÛÙØ˜XÚÙÜ›Ý[™˜\ŠK]X[X™ÊNØ›Ü™\‹[YŒÜÛÛY˜\ŠK]X[
NÜY[™ÎŒL\LÜÙ›Û\Ú^™NŒL‹\ÛX\™Ú[ŽŒMB‚‹ÊˆKKKKKKKKKHš[\œÈKKKKKKKKKH
‹Â‹™š[\œÈÂˆ\Ü^Nˆ›^Âˆ›^]Ü˜\ˆÜ˜\ÂˆØ\ˆLœÂˆ[YÛ‹Z][\ÎˆÙ[\ŽÂˆ˜XÚÙÜ›Ý[™ˆ˜\ŠK\Ý\™˜XÙJNÂˆ›Ü™\Žˆ\ÛÛY˜\ŠK[[™JNÂˆ›Ü™\‹X›ÝÛNˆ›Û™NÂˆY[™ÎˆLœMÂŸB‹™š[\œÈÙ[XÝÂˆ›ÛY˜[Z[Nˆ˜\ŠKX›ÙJNÂˆ›Û\Ú^™NˆL‹\ÂˆY[™ÎˆÜLœÂˆ›Ü™\Žˆ\ÛÛY˜\ŠK[[™JNÂˆ˜XÚÙÜ›Ý[™ˆ˜\ŠK\Ý\™˜XÙJNÂˆ›Ü™\‹\˜Y]\ÎˆÜÂˆÝ][™Nˆ›Û™NÂˆÛÛÜŽˆ˜\ŠKZ[šÊNÂˆZ[‹]ÚYˆMÂˆÝ\œÛÜŽˆÚ[\ŽÂŸB‹™š[\œÈÙ[XÝ™›ØÝ\Ë™š[\œÈ[œ]™›ØÝ\ÈÂˆ›Ü™\‹XÛÛÜŽˆ˜\ŠK[ØÚ™JNÂŸB‹™š[\œÈ[œ]Âˆ›^ˆNÂˆZ[‹]ÚYˆŒŒÂˆ›ÛY˜[Z[Nˆ˜\ŠKX›ÙJNÂˆ›Û\Ú^™NˆL‹\ÂˆY[™ÎˆÜLœÂˆ›Ü™\Žˆ\ÛÛY˜\ŠK[[™JNÂˆ˜XÚÙÜ›Ý[™ˆ˜\ŠK\Ý\™˜XÙJNÂˆ›Ü™\‹\˜Y]\ÎˆÜÂˆÝ][™Nˆ›Û™NÂˆÛÛÜŽˆ˜\ŠKZ[šÊNÂŸB‹™š[\œÈ›ˆÂˆX\™Ú[‹[Yˆ]]ÎÂˆ›ÛY˜[Z[Nˆ˜\ŠKY\Ü^JNÂˆ›Û\Ú^™NˆLK\ÂˆÛÛÜŽˆ˜\ŠKZ[šËLÊNÂˆÚ]K\ÜXÙNˆ›ÝÜ˜\ÂŸB‚‹ÊˆKKKKKKKKKHY\ˆKKKKKKKKKH
‹Â‹›Y\žØ˜XÚÙÜ›Ý[™˜\ŠK\Ý\™˜XÙJNØ›Ü™\ŽŒ\ÛÛY˜\ŠK[[™J_B‹œ\Ù^ÜY[™ÎŽ\MÜØ˜XÚÙÜ›Ý[™ˆÑŒ‘QŽØ›Ü™\‹X›ÝÛNŒ\ÛÛY˜\ŠK[[™K\ÛÙ
NÙ›ÛY˜[Z[N˜\ŠKY\Ü^JNÙ›Û\Ú^™NŒL\Û]\‹\ÜXÚ[™Î‹ŒM™[NÝ^]˜[œÙ›Ü›N\\˜Ø\ÙNØÛÛÜŽ˜\ŠKZ[šËLŠNÙ›Û]ÙZYÚŒB‹œ[™ÞÙ\Ü^N™›^ÙØ\ŒMÜY[™ÎŒMœNØ›Ü™\‹X›ÝÛNŒ\ÛÛY˜\ŠK[[™K\ÛÙ
NØ[YÛ‹Z][\Î™›^\Ý\Ý˜[œÚ][ÛŽ˜˜XÚÙÜ›Ý[™XÛÛÜˆÈX\Ù_B‹œ[™Î›\ÝXÚ[Ø›Ü™\‹X›ÝÛN››Û™_B‹œ[™Ë™Û™^Ø˜XÚÙÜ›Ý[™ˆÑQÑ_B‹œ[™Ë››ÝÞØ˜XÚÙÜ›Ý[™ˆÑ‘‘ÑNØ›Ü™\‹[YŒÜÛÛY˜\ŠK[ØÚ™J_B‹œ[™Ë›ØÚÙYÛÜXÚ]N‹_BÙ^Yœ˜[Y\È›\ÚYÚYÚÂˆ	HÈ˜XÚÙÜ›Ý[™XÛÛÜŽˆ™Ø˜JŒMËLNK‹ŒŽ
NÈBˆL	HÈ˜XÚÙÜ›Ý[™XÛÛÜŽˆ˜[œÜ\™[ÈBŸB‹œ[™ËšYÚYÚY›\ÚÂˆ[š[X][ÛŽˆ›\ÚYÚYÚ‹\ÈX\ÙK[Ý]ÂŸB‹œ[™È›X\šÞÂˆÚYŒŽÚZYÚŒŽÙ›^››Û™NØ›Ü™\‹\˜Y]\ÎL	NØ›Ü™\ŽŒ\ÛÛY˜\ŠK[[™JNÂˆ\Ü^N™ÜšYÜXÙKZ][\Î˜Ù[\ŽÙ›ÛY˜[Z[N˜\ŠKY\Ü^JNÙ›Û\Ú^™NŒL\ØÛÛÜŽ˜\ŠKZ[šËLÊNØ˜XÚÙÜ›Ý[™˜\ŠK\Ý\™˜XÙJNÂŸB‹œ[™Ë™Û™H›X\šÞØ˜XÚÙÜ›Ý[™˜\ŠK]X[
NØ›Ü™\‹XÛÛÜŽ˜\ŠK]X[
NØÛÛÜŽˆÙ™™ŸB‹œ[™Ë››ÝÈ›X\šÞØ›Ü™\‹XÛÛÜŽ˜\ŠK[ØÚ™JNØÛÛÜŽ˜\ŠK[ØÚ™JNÙ›Û]ÙZYÚÌØ›Þ\ÚYÝÎŒÜ˜\ŠK[ØÚ™KX™Ê_B‹œ[™Ë›ØÚÙY›X\šÞØ˜XÚÙÜ›Ý[™ˆÑŒŒÑŽØÛÛÜŽ˜\ŠKZ[šËLÊ_B‹œ[™ÈÙ›^ŒNÛZ[‹]ÚYŒB‹œ[™ÈÞÙ›Û\Ú^™NŒLË\ÛX\™Ú[ŽŒœœÙ›Û]ÙZYÚŒB‹œ[™È›Y]^Ù›Û\Ú^™NŒLK\ØÛÛÜŽ˜\ŠKZ[šËLÊ_B‹œ[™È™]žÙ›ÛY˜[Z[N˜\ŠKY\Ü^JNÙ›Û\Ú^™NŒL\ØÛÛÜŽ˜\ŠKZ[šËLŠNÛX\™Ú[‹]ÜœB‹œ[™ÈœÚY^Ù›^››Û™NÝ^X[YÛŽœšYÚÙ\Ü^N™›^Ù›^Y\™XÝ[ÛŽ˜ÛÛ[[ŽØ[YÛ‹Z][\Î™›^Y[™ÙØ\Ž\B‹œ\Ù\Ü^N™›^ÙØ\ÜÙ›^]Ü˜\Ü˜\ÛX\™Ú[‹]ÜŒLØ[YÛ‹Z][\Î˜Ù[\ŸB‹œÝ\XÝ\ÝÛKX›ÞÛX\™Ú[‹]ÜŒLœÜY[™ÎŒLœØ˜XÚÙÜ›Ý[™ˆÑŽQ‘ÎØ›Ü™\ŽŒ\ÛÛY˜\ŠK[[™K\ÛÙ
NØ›Ü™\‹\˜Y]\ÎŒœB‹›Ù™˜›Ø\™YXÛY[X˜[›™\žÙ\Ü^N™ÜšYÙØ\\Ø›Þ\Ú^š[™Î˜›Ü™\‹X›ÞÝÚYŒL	NÛX\™Ú[ŽŒMNÜY[™ÎŒM\NØ›Ü™\ŽŒ\ÛÛY˜\ŠKXœšXÚÊNØ›Ü™\‹[Y]ÚY\Ø˜XÚÙÜ›Ý[™˜\ŠKXœšXÚËX™ÊNØÛÛÜŽ˜\ŠKXœšXÚÊ_B‹›Ù™˜›Ø\™YXÛY[X˜[›™\ˆÝ›Û™ÞÙ›Û\Ú^™NŒMB‹›Ù™˜›Ø\™YXÛY[X˜[›™\ˆÜ[žÙ›Û\Ú^™NŒLœÛ[™KZZYÚŒK_B‹˜‹Y^YK™š[\Ë\Ú[™ÛKY^YNŽ˜™Y›Ü™^Ù\Ü^N››Û™HZ[\Ü[B‹˜‹Y^YK™š[\Ë\Ú[™ÛKY^YHÝ™ÞÙ\Ü^N˜›ØÚÈZ[\Ü[B‹›ØÚÙY]šY]ËXÛY[X˜\žÙ\Ü^N™ÜšYÙÜšY][\]KXÛÛ[[œÎ˜]]ÈZ[›X^
MŒ
NØ[YÛ‹Z][\Î˜Ù[\ŽÙØ\ŒLœÛX\™Ú[‹]ÜŒMœBYYXJX^]ÚYŒŒ
^Ë›ØÚÙY]šY]ËXÛY[X˜\žÙÜšY][\]KXÛÛ[[œÎŒYœŸ_B‚‹ÊˆKKKKKKKKKHØÚÙYÛ˜›Ø\™[™È\ÝÜžHKKKKKKKKKH
‹Â‹›Û˜›Ø\™[™ËZ\ÝÜžK]šY]ÞÝÚYŒL	NÛX^]ÚYŒL	NÛZ[‹]ÚYŒÛÝ™\™›ÝÎšY[ŸB‹›Û˜›Ø\™[™ËZ\ÝÜžKZXY\™]žÝÚYŒL	NÛZ[‹]ÚYŒB‹›Û˜›Ø\™[™ËXÛY[ZXY[™ÞÙ\Ü^N™ÜšYÙÜšY][\]KXÛÛ[[œÎ›Z[›X^
Œ
HZ[›X^
YœŠNØ[YÛ‹Z][\Î˜Ù[\ŽÙØ\ŒMœÛX\™Ú[Ž\B‹›Û˜›Ø\™[™ËXÛY[ZXY[™È^ÛX\™Ú[ŽŒÝÚ]K\ÜXÙN››ÝÜ˜\ÛÝ™\™›ÝË]Ü˜\››Ü›X[B‹›Û˜›Ø\™[™ËXÛY[\Ù[XÝÛZ[‹]ÚYŒB‹›Û˜›Ø\™[™Ë[ØÚË[›ÝXÙ^Ø›Þ\Ú^š[™Î˜›Ü™\‹X›ÞÝÚYŒL	NÛX\™Ú[ŽŒMœÜY[™ÎŒMœNØ›Ü™\ŽŒ\ÛÛY˜\ŠKXœšXÚÊNØ›Ü™\‹[Y]ÚY\Ø˜XÚÙÜ›Ý[™˜\ŠKXœšXÚËX™ÊNØÛÛÜŽ˜\ŠKXœšXÚÊ_B‹›Û˜›Ø\™[™Ë[ØÚË[›ÝXÙO™]žÛX\™Ú[‹]Ü\Ù›Û\Ú^™NŒLœÛ[™KZZYÚŒK_B‹›Û˜›Ø\™[™ËZ\ÝÜžK[\ÝÝÚYŒL	NÛX^]ÚYŒL	NØ›Þ\Ú^š[™Î˜›Ü™\‹X›ÞÛÝ™\™›ÝÎšY[ŸB‹›Û˜›Ø\™[™ËZ\ÝÜžK\[™ÞÙ\Ü^N™ÜšYÙÜšY][\]KXÛÛ[[œÎŒŽZ[›X^
YœŠH]]ÎØ[YÛ‹Z][\ÎœÝ\ÙØ\ŒMÜY[™ÎŒMœNB‹›Û˜›Ø\™[™ËZ\ÝÜžK\[™È›X\šÞÛX\™Ú[ŽŒB‹›Û˜›Ø\™[™ËZ\ÝÜžK\[™Ï‹YÞØ[YÛ‹\Ù[ŽœÝ\ÝÚ]K\ÜXÙN››ÝÜ˜\B‹›Û˜›Ø\™[™ËYš[K[˜[Y^ÛX^]ÚYŒL	NÛX\™Ú[‹]ÜœÙ›Û\Ú^™NŒLœÛ[™KZZYÚŒKNÛÝ™\™›ÝË]Ü˜\˜[ž]Ú\™NÝÛÜ™Xœ™XZÎ˜œ™XZË]ÛÜ™B‚YYXH
X^]ÚYÍŒ
^Âˆ›Û˜›Ø\™[™ËXÛY[ZXY[™ÞÙÜšY][\]KXÛÛ[[œÎŒYœŽÙØ\ŒLBˆ›Û˜›Ø\™[™ËXÛY[ZXY[™È^ÝÚ]K\ÜXÙN››Ü›X[Bˆ›Û˜›Ø\™[™ËZ\ÝÜžK\[™ÞÙÜšY][\]KXÛÛ[[œÎŒŽZ[›X^
YœŠNÙØ\ŒLÜY[™ÎŒMLœBˆ›Û˜›Ø\™[™ËZ\ÝÜžK\[™Ï‹YÞÙÜšYXÛÛ[[ŽŒŽÚ\ÝYžK\Ù[ŽœÝ\BŸB‚‹ÊˆKKKKKKKKKHÙ[\™Y[Ù[ÈKKKKKKKKKH
‹Â‹›[Ù[ÂˆÜÚ][ÛŽˆš^YÂˆÜˆÂˆYˆÂˆÚYˆLÎÂˆZYÚˆLšÂˆ˜XÚÙÜ›Ý[™ˆ™Ø˜JLËŒËÍ‹JNÂˆ˜XÚÙ›ÜYš[\Žˆ›\ŠÜ
NÂˆ\Ü^Nˆ›^Âˆ[YÛ‹Z][\ÎˆÙ[\ŽÂˆ\ÝYžKXÛÛ[ˆÙ[\ŽÂˆ‹Z[™^ˆNNNNÂˆÜXÚ]NˆÂˆÚ[\‹Y]™[Îˆ›Û™NÂˆ˜[œÚ][ÛŽˆÜXÚ]HŒœÈX\ÙKZ[‹[Ý]ÂŸB‹›[Ù[›ÛˆÂˆÜXÚ]NˆNÂˆÚ[\‹Y]™[Îˆ]]ÎÂŸB‹›[Ù[XØ\™Âˆ˜XÚÙÜ›Ý[™ˆ˜\ŠK\Ý\™˜XÙJNÂˆ›Ü™\Žˆ\ÛÛY˜\ŠK[[™JNÂˆ›Ü™\‹\˜Y]\ÎˆœÂˆ›Þ\ÚYÝÎˆMœ™Ø˜JŒÍJNÂˆÚYˆL‰NÂˆX^]ÚYˆLŒÂˆX^ZZYÚˆLšÂˆÝ™\™›ÝË^Nˆ]]ÎÂˆY[™ÎˆœÂˆ˜[œÙ›Ü›NˆØØ[JŽM
NÂˆ˜[œÚ][ÛŽˆ˜[œÙ›Ü›HŒœÈÝXšXËX™^šY\ŠŒM‹KŒËJNÂŸB‹›[Ù[›Ûˆ›[Ù[XØ\™Âˆ˜[œÙ›Ü›NˆØØ[JJNÂŸB‹›[Ù[]Âˆ›Û\Ú^™NˆMœÂˆ›Û]ÙZYÚˆŒÂˆÛÛÜŽˆ˜\ŠKZ[šÊNÂˆX\™Ú[‹X›ÝÛNˆÂŸB‹›[Ù[XˆÂˆ›Û\Ú^™NˆL‹\ÂˆÛÛÜŽˆ˜\ŠKZ[šËLŠNÂˆX\™Ú[‹X›ÝÛNˆMœÂˆ[™KZZYÚˆKNÂŸB‹™šY[ÂˆX\™Ú[‹X›ÝÛNˆMÂŸB‹™šY[X™[Âˆ\Ü^Nˆ›ØÚÎÂˆ›Û\Ú^™NˆLK\Âˆ›Û]ÙZYÚˆŒÂˆÛÛÜŽˆ˜\ŠKZ[šËLŠNÂˆX\™Ú[‹X›ÝÛNˆÂŸB‹™šY[[œ]™šY[Ù[XÝ™šY[^\™XHÂˆÚYˆL	NÂˆY[™ÎˆÜLÂˆ›Ü™\Žˆ\ÛÛY˜\ŠK[[™JNÂˆ›Ü™\‹\˜Y]\ÎˆÜÂˆ›ÛY˜[Z[Nˆ˜\ŠKX›ÙJNÂˆ›Û\Ú^™NˆL‹\Âˆ˜XÚÙÜ›Ý[™ˆ˜\ŠK\Ý\™˜XÙJNÂˆÛÛÜŽˆ˜\ŠKZ[šÊNÂŸB‹™šY[[œ]™›ØÝ\Ë™šY[Ù[XÝ™›ØÝ\Ë™šY[^\™XN™›ØÝ\ÈÂˆÝ][™Nˆ›Û™NÂˆ›Ü™\‹XÛÛÜŽˆ˜\ŠK[ØÚ™JNÂŸB‚‹ÊˆÛÛ\XÝYZ[ˆÛÜšÜÜXÙHÚ[H™\Ù\š[™È]™\žH[œÝXÝ[Ûˆ[™XÝ[Û‹ˆ
‹Â‹›XZ[žÜY[™ÎŒŒB‹šY]Ë›Û‹œÝX‹šY]Ë›Û‹š‹\›ÝÈœÝXžÛX\™Ú[‹X›ÝÛNŒLœÛ[™KZZYÚŒK_B‹šY]Ë›Ûˆš‹\›ÝÞÛX\™Ú[‹X›ÝÛNŒLB‹šY]Ë›Ûˆ˜Ø\™ÜY[™ÎŒLœMÛX\™Ú[‹X›ÝÛNŒLB‹šY]Ë›Ûˆ›Y]šXÜÞÛX\™Ú[‹X›ÝÛNŒLœB‹šY]Ë›Ûˆ›Y]šXÞÜY[™ÎŒL\LÜB‹šY]Ë›Ûˆ›Y]šXÈžÙ›Û\Ú^™NŒŒ\B‹šY]Ë›Ûˆ›Y]šXÈ™ÛX\™Ú[‹]ÜŒÜB‹šY]Ë›Ûˆ˜ÛÛÞÙØ\ŒLB‹šY]Ë›Ûˆ™š[\œËšY]Ë›Ûˆ™š[\œËX˜\žÙØ\ŽÜY[™ÎŽLB‹šY]Ë›Ûˆ››ÝKšY]Ë›Ûˆ™ÛÛÙšY]Ë›ÛˆœÝX‹šY]Ë›ÛˆœÝ]\ËX˜[›™\žÛX\™Ú[ŽŒLÜY[™ÎŽ\L\B‹šY]Ë›ÛˆX›HÜY[™ÎŽ\LB‹šY]Ë›ÛˆX›HÜY[™ÎŽ\LB‹šY]Ë›Ûˆ‹œÙXÞÛX\™Ú[ŽŒMœB‹›Y\ˆœ\Ù^ÜY[™ÎÜMB‹›Y\ˆœ[™ÞÜY[™ÎŒLœMÙØ\ŒL\B‚‹Êˆ[œÙHÛ˜›Ø\™[™ÈÛÜšÜÜXÙNˆ™]Z[ˆHÛÜšÙ›ÝÈYX[š[™ÈÚ]\ÜÈØÜ›Û[™Ëˆ
‹ÂˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë]ÛÜšÙ›ÝËZXY[™Ë™ØÝ[Y[Ë]ÛÜšÜÜXÙKZXY[™ÞÙ\Ü^N™›^Ø[YÛ‹Z][\Î˜Ù[\ŽÙØ\ŒLœÛX\™Ú[ŽŒœÜÛZ[‹]ÚYŒBˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë]ÛÜšÙ›ÝËZXY[™Ï™]‹™ØÝ[Y[Ë]ÛÜšÜÜXÙKZXY[™Ï™]žÙ›^ŒHÍLÛZ[‹]ÚYŒŒŒBˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë]ÛÜšÙ›ÝËZXY[™ÈK™ØÝ[Y[Ë]ÛÜšÜÜXÙKZXY[™È^Ù›^››Û™NÛX\™Ú[ŽŒÝÚ]K\ÜXÙN››ÝÜ˜\ÛÝ™\™›ÝË]Ü˜\››Ü›X[BˆÝ‹[Û˜›Ø\™‹š‹\›ÝÞÛX\™Ú[‹X›ÝÛNŽBˆÝ‹[Û˜›Ø\™‹š‹\›ÝÈœÝXžÛX\™Ú[‹X›ÝÛNŒBˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë[Y]šXÜÞÙÜšY][\]KXÛÛ[[œÎœ™\X]
Z[›X^
YœŠJNÛX\™Ú[‹X›ÝÛNŒLBˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë[Y]šXÜÈ›Y]šXÞÛZ[‹ZZYÚŽœÜY[™ÎŒLLÜBˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë[Y]šXÜÈžÙ›Û\Ú^™NŒŒÛ[™KZZYÚŒKŒ_BˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë[Y]šXÜÈ›ÛX\™Ú[‹]ÜŒ\BˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë[Y]šXÜÈ™ÛX\™Ú[‹]ÜŒÜÛ[™KZZYÚŒKŒÍ_BˆÝ‹[Û˜›Ø\™œ[™ÈÞÛX\™Ú[‹]ÜŒBˆÝ‹[Û˜›Ø\™œ[™È™]žÛX\™Ú[‹]ÜBˆÝ‹[Û˜›Ø\™œ[™ÈœÚY^ÙØ\œBˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë]ÛÜšÙ›ÝË[›Ý^Ù›Û\Ú^™NŒLK\B‚YYXJX^]ÚYŽL
^Âˆ›XZ[žÜY[™ÎŒNMœÎBˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë]ÛÜšÙ›ÝËZXY[™Ë™ØÝ[Y[Ë]ÛÜšÜÜXÙKZXY[™ÞØ[YÛ‹Z][\ÎœÝ™]ÚÙ›^Y\™XÝ[ÛŽ˜ÛÛ[[ŽÙØ\ÜBˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë]ÛÜšÙ›ÝËZXY[™Ï™]‹™ØÝ[Y[Ë]ÛÜšÜÜXÙKZXY[™Ï™]žÙ›^X˜\Ú\Î˜]]ÎÛZ[‹]ÚYŒBˆÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë[Y]šXÜÞÙÜšY][\]KXÛÛ[[œÎœ™\X]
‹Z[›X^
YœŠJ_BŸBYYXJX^]ÚYMŒ
^ÈÝ‹[Û˜›Ø\™›Û˜›Ø\™[™Ë[Y]šXÜÞÙÜšY][\]KXÛÛ[[œÎŒYœŸ_B‚‹Êˆ[œÙHÛÈ]™HÛÜšÜÜXÙH[YÛ™YÚ]Û˜›Ø\™[™Ëˆ
‹ÂˆÝ‹\›Û[ÝH™ÛÛ]™K]ÛÜšÜÜXÙKZXY[™ÞÙ\Ü^N™›^Ø[YÛ‹Z][\Î˜Ù[\ŽÙØ\ŒLœÛX\™Ú[ŽŒœÜÛZ[‹]ÚYŒBˆÝ‹\›Û[ÝH™ÛÛ]™K]ÛÜšÜÜXÙKZXY[™Ï™]žÙ›^ŒHÎÛZ[‹]ÚYŒŒŒBˆÝ‹\›Û[ÝH™ÛÛ]™K]ÛÜšÜÜXÙKZXY[™È^Ù›^››Û™NÛX\™Ú[ŽŒÝÚ]K\ÜXÙN››ÝÜ˜\ÛÝ™\™›ÝË]Ü˜\››Ü›X[BˆÝ‹\›Û[ÝO‹š‹\›ÝÞÛX\™Ú[‹X›ÝÛNŽBˆÝ‹\›Û[ÝH™ÛÛ]™K[Y]šXÜÞÙÜšY][\]KXÛÛ[[œÎœ™\X]
Z[›X^
YœŠJNÛX\™Ú[‹X›ÝÛNŒLBˆÝ‹\›Û[ÝH™ÛÛ]™K[Y]šXÜÈ›Y]šXÞÛZ[‹ZZYÚŽœÜY[™ÎŒLLÜBˆÝ‹\›Û[ÝH™ÛÛ]™K[Y]šXÜÈžÙ›Û\Ú^™NŒŒÛ[™KZZYÚŒKŒ_BˆÝ‹\›Û[ÝH™ÛÛ]™K[Y]šXÜÈ™ÛX\™Ú[‹]ÜŒÜBˆÝ‹\›Û[ÝHœ[™ÞÜY[™ÎŒL\MBˆÝ‹\›Û[ÝHœ[™ÈœÚY^ÙØ\œBˆÝ‹\›Û[ÝHœÝ\XÝ\ÝÛKX›ÞÛX\™Ú[‹]ÜÜZ[\Ü[B‚YYXJX^]ÚYŽL
^ÂˆÝ‹\›Û[ÝH™ÛÛ]™K]ÛÜšÜÜXÙKZXY[™ÞØ[YÛ‹Z][\ÎœÝ™]ÚÙ›^Y\™XÝ[ÛŽ˜ÛÛ[[ŽÙØ\ÜBˆÝ‹\›Û[ÝH™ÛÛ]™K]ÛÜšÜÜXÙKZXY[™Ï™]žÙ›^X˜\Ú\Î˜]]ÎÛZ[‹]ÚYŒBˆÝ‹\›Û[ÝH™ÛÛ]™K[Y]šXÜÞÙÜšY][\]KXÛÛ[[œÎœ™\X]
‹Z[›X^
YœŠJ_BŸBYYXJX^]ÚYMŒ
^ÈÝ‹\›Û[ÝH™ÛÛ]™K[Y]šXÜÞÙÜšY][\]KXÛÛ[[œÎŒYœŸ_B‚‹˜YZ[‹XÚXÚÜËZXY[™ÞÙ\Ü^N™›^Ø[YÛ‹Z][\Î˜Ù[\ŽÙØ\ŒMÛX\™Ú[‹X›ÝÛNŒLB‹˜YZ[‹XÚXÚÜËZXY[™È^Ù›^››Û™NÛX\™Ú[ŽŒÝÚ]K\ÜXÙN››ÝÜ˜\B‹˜YZ[‹XÚXÚÜËZXY[™Ï™]žÙ›^ŒHÌÛZ[‹]ÚYŒŒB‹˜YZ[‹XÚXÚÜËZXY[™ÊËšY]Ë›Û‹™^YXœ›ÝÞÛX\™Ú[‹X›ÝÛNŽZ[\Ü[BYYXJX^]ÚYÌ
^Ë˜YZ[‹XÚXÚÜËZXY[™ÞØ[YÛ‹Z][\ÎœÝ™]ÚÙ›^Y\™XÝ[ÛŽ˜ÛÛ[[ŸK˜YZ[‹XÚXÚÜËZXY[™Ï™]žÙ›^X˜\Ú\Î˜]]ÎÛZ[‹]ÚYŒ_B‹˜YZ[‹\ØÜ™Y[‹XXØÙ\ÜÈÈX\™Ú[‹]ÜˆMÈY[™Ë]ÜˆMÈ›Ü™\‹]Üˆ\ÛÛY˜\ŠK[[™JNÈB‹˜YZ[‹\ØÜ™Y[‹XXØÙ\ÜËZXY[™ÈÈ\Ü^Nˆ›^È[YÛ‹Z][\Îˆ˜\Ù[[™NÈ\ÝYžKXÛÛ[ˆÜXÙKX™]ÙY[ŽÈØ\ˆLœÈX\™Ú[‹X›ÝÛNˆLÈB‹˜YZ[‹\ØÜ™Y[‹XXØÙ\ÜËZXY[™ÈÜ[ˆÈÛÛÜŽˆ˜\ŠKZ[šËLÊNÈ›Û\Ú^™NˆL\ÈB‹˜YZ[‹\ØÜ™Y[‹XXØÙ\ÜËYÜšYÈ\Ü^NˆÜšYÈÜšY][\]KXÛÛ[[œÎˆ™\X]
‹Z[›X^
YœŠJNÈØ\ˆÜLœÈB‹˜YZ[‹\ØÜ™Y[‹XXØÙ\ÜËYÜšYX™[È\Ü^Nˆ›^È[YÛ‹Z][\ÎˆÙ[\ŽÈØ\ˆÜÈZ[‹]ÚYˆÈ›Û\Ú^™NˆLÜÈB‹˜YZ[‹\ØÜ™Y[‹XXØÙ\ÜËYÜšY[œ]ÈÚYˆM\ÈZYÚˆM\ÈB‹˜YZ[‹XÛY[YÜ˜[Y›Ü›HÈ\Ü^NˆÜšYÈÜšY][\]KXÛÛ[[œÎˆZ[›X^
LÌŽœŠHZ[›X^
ŒŒK™œŠH]]ÎÈØ\ˆÈB‹˜YZ[‹XÛY[YÜ˜[Y›Ü›HÙ[XÝ˜YZ[‹XÛY[YÜ˜[Y›Ü›H[œ]ÈZ[‹]ÚYˆÈY[™ÎˆLÈ›Ü™\Žˆ\ÛÛY˜\ŠK[[™JNÈ˜XÚÙÜ›Ý[™ˆ˜\ŠK\Ý\™˜XÙJNÈB‹˜YZ[‹XXÝ]™KYÜ˜[È\Ü^Nˆ›^È[YÛ‹Z][\ÎˆÙ[\ŽÈ\ÝYžKXÛÛ[ˆÜXÙKX™]ÙY[ŽÈØ\ˆLÈX\™Ú[‹]ÜˆÈY[™ÎˆÜ\È˜XÚÙÜ›Ý[™ˆ˜\ŠK\\\ŠNÈ›Ü™\Žˆ\ÛÛY˜\ŠK[[™JNÈ›Û\Ú^™NˆLœÈB