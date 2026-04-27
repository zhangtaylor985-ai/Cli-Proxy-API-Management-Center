export function formatApiKeyOwnerLabel(username?: string, role?: string): string {
  if (role !== 'staff') return 'Admin';
  const normalized = String(username || '').trim();
  if (!normalized) return 'User';
  if (normalized === 'user_01') return 'User01';
  if (normalized === 'user_02') return 'User02';
  return normalized;
}

export function knownStaffOwnerOptions(owners: Array<{ username: string; role: string; count?: number }>) {
  const byKey = new Map<string, { username: string; role: string; count?: number }>();
  for (const owner of owners) {
    if (owner.role !== 'staff') continue;
    byKey.set(canonicalOwnerKey(owner.username), owner);
  }
  for (const username of ['user_01', 'user_02']) {
    const key = canonicalOwnerKey(username);
    if (!byKey.has(key)) {
      byKey.set(key, { username, role: 'staff', count: 0 });
    }
  }
  return Array.from(byKey.values()).sort((left, right) =>
    formatApiKeyOwnerLabel(left.username, left.role).localeCompare(
      formatApiKeyOwnerLabel(right.username, right.role),
      'zh-CN'
    )
  );
}

function canonicalOwnerKey(username: string) {
  return String(username || '').trim();
}
