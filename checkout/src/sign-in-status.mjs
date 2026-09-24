// Convert provider failures to fixed public messages. Never render raw SDK errors:
// their messages/causes may include URLs, identifiers or session material.
export function signInIssue({ error, slow = false, ready = false, authenticated = false, walletReady = false, secure = true, storageAvailable = true } = {}) {
  if (ready && (!authenticated || walletReady)) return null;
  if (!secure) return { code: 'HB-A01', message: 'Open Honeybee using its secure website link.' };
  if (!storageAvailable) return { code: 'HB-A02', message: 'This browser is blocking wallet storage. Open Honeybee in Safari or Chrome.' };
  if (error) {
    const description = [error.name, error.code, error.privyErrorCode, error.message, error.cause?.name, error.cause?.message].filter(v => typeof v === 'string').join(' ').toLowerCase();
    if (/origin|domain.*(allow|block)|cors/.test(description)) return { code: 'HB-A03', message: 'The sign-in service could not authorize this website. Honeybee’s sign-in settings need checking.' };
    if (/app.?id|app.?client|application.*(invalid|not found)|invalid.*application/.test(description)) return { code: 'HB-A04', message: 'Honeybee’s sign-in configuration could not be loaded.' };
    if (/storage|securityerror|quota/.test(description)) return { code: 'HB-A02', message: 'This browser is blocking wallet storage. Open Honeybee in Safari or Chrome.' };
    if (/fetch|network|timeout|timed out|load failed|connection/.test(description)) return { code: 'HB-A05', message: 'Honeybee could not reach its sign-in service. Try opening this link directly in Safari or Chrome.' };
    return { code: 'HB-A06', message: 'The sign-in service could not start. This needs troubleshooting.' };
  }
  if (slow) return { code: authenticated ? 'HB-A08' : 'HB-A07', message: authenticated ? 'You’re signed in, but your wallet has not finished opening.' : 'The sign-in service has not finished starting. Try opening this link directly in Safari or Chrome.' };
  return null;
}

export function canReadWalletStorage(getStorage = () => localStorage) {
  try { getStorage().getItem('honeybee:storage-check'); return true; }
  catch { return false; }
}
