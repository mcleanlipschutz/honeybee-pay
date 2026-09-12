import { createHash } from 'node:crypto';
import { importSPKI, jwtVerify } from 'jose';

// Configuration is trusted application configuration, never request data.
// A fixed verification key prevents token headers from choosing a key or URL.
export async function createAccountAuthenticator({ appId, verificationKey }) {
  if (typeof appId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(appId)
      || typeof verificationKey !== 'string' || verificationKey.length > 4096) {
    throw new Error('Account authentication configuration is invalid');
  }
  const key = await importSPKI(verificationKey, 'ES256');
  return async accessToken => {
    try {
      if (typeof accessToken !== 'string' || accessToken.length > 16384) throw new Error();
      const { payload, protectedHeader } = await jwtVerify(accessToken, key, {
        algorithms: ['ES256'], issuer: 'privy.io', audience: appId,
        requiredClaims: ['sub', 'sid', 'iat', 'exp'], maxTokenAge: 3600,
        clockTolerance: 0,
      });
      if ((protectedHeader.typ !== undefined && protectedHeader.typ !== 'JWT')
          || payload.aud !== appId || !/^did:privy:[a-zA-Z0-9_-]{1,128}$/.test(payload.sub)
          || typeof payload.sid !== 'string' || !payload.sid || payload.sid.length > 256
          || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
          || payload.exp <= payload.iat || payload.exp - payload.iat > 3600
          || 'linked_accounts' in payload || 'custom_metadata' in payload) throw new Error();
      const ownerId = createHash('sha256').update(JSON.stringify([
        'honeybee:account:v1', 'privy.io', appId, payload.sub,
      ])).digest('hex');
      // Only the verified subject determines storage. A session change does not
      // change wallet ownership. This hash is a pseudonym, not anonymization.
      return Object.freeze({ ownerId, expiresAt: payload.exp * 1000 });
    } catch { throw new Error('Account authentication failed'); }
  };
}
