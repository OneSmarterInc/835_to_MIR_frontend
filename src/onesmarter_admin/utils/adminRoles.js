export function isSuperAdminAccount(user) {
  if (Boolean(user?.is_superuser)) return true;
  const role = String(user?.role || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  return role === 'super admin' || role === 'superadmin';
}

export function isAdministrativeAccount(user) {
  if (Boolean(user?.is_staff) || isSuperAdminAccount(user)) return true;
  const role = String(user?.role || '').trim().toLowerCase();
  return role === 'admin';
}
