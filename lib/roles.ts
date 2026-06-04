export const ROLE_PLAYER = "player";
export const ROLE_ADMIN = "admin";
export const ROLE_SUPER_ADMIN = "super_admin";

export type ProfileRoles = {
  roles?: string[] | null;
  is_admin?: boolean | null;
  email?: string | null;
  role?: string | null;
};

export function normalizeRoles(rawRoles?: string[] | null): string[] {
  if (Array.isArray(rawRoles) && rawRoles.length > 0) {
    return Array.from(new Set(rawRoles.map((role) => role?.toString().trim().toLowerCase()).filter(Boolean)));
  }

  return [ROLE_PLAYER];
}

export function ensureRoles(rawRoles?: string[] | null, isAdmin = false): string[] {
  const roles = new Set(normalizeRoles(rawRoles));
  roles.add(ROLE_PLAYER);

  if (isAdmin) {
    roles.add(ROLE_ADMIN);
  }

  return Array.from(roles);
}

export function hasRole(profile?: ProfileRoles, role?: string): boolean {
  if (!role || !profile) return false;

  const combinedRoles: string[] | null = Array.isArray(profile.roles)
    ? profile.roles
    : profile.roles ?? (profile.role ? [profile.role] : null);

  const normalized = normalizeRoles(combinedRoles);

  if (normalized.includes(role)) {
    return true;
  }

  if (role === ROLE_ADMIN && (profile.is_admin || normalized.includes(ROLE_SUPER_ADMIN))) {
    return true;
  }

  return false;
}

export function isAdmin(profile?: ProfileRoles): boolean {
  return hasRole(profile, ROLE_ADMIN) || hasRole(profile, ROLE_SUPER_ADMIN);
}

export function isSuperAdmin(profile?: ProfileRoles): boolean {
  return hasRole(profile, ROLE_SUPER_ADMIN);
}

export function getRoleLabels(profile?: ProfileRoles): string[] {
  const combinedRoles: string[] | null = Array.isArray(profile?.roles)
    ? profile!.roles
    : profile?.roles ?? (profile?.role ? [profile.role] : null);

  const roles = normalizeRoles(combinedRoles);
  if (profile?.is_admin && !roles.includes(ROLE_ADMIN)) {
    roles.push(ROLE_ADMIN);
  }

  return roles;
}
