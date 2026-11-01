const storageKey = 'erbsenzahler.importSetups.v1';

export function readImportPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const profiles = (Array.isArray(stored.profiles) ? stored.profiles : []).filter((profile) => (
      typeof profile.id === 'string' && typeof profile.name === 'string'
      && typeof profile.hasHeader === 'boolean'
      && ['spend_positive', 'spend_negative'].includes(profile.amountSign)
      && profile.columnMapping && typeof profile.columnMapping === 'object' && !Array.isArray(profile.columnMapping)
      && Object.keys(profile.columnMapping).every((key) => ['date', 'description', 'amount', 'account'].includes(key))
      && Object.values(profile.columnMapping).every((value) => value === '' || /^\d+$/.test(String(value)))
      && typeof profile.defaultAccount === 'string'
    ));
    return { profiles, selectedId: profiles.some((profile) => profile.id === stored.selectedId) ? stored.selectedId : '' };
  } catch {
    return { profiles: [], selectedId: '' };
  }
}

export function writeImportPreferences(profiles, selectedId) {
  localStorage.setItem(storageKey, JSON.stringify({ profiles, selectedId }));
}
