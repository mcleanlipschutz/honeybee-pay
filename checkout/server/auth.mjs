import { importSPKI, jwtVerify } from 'jose';

export const APP_ID = 'cmtvj5kge00ms0dl62xnconc8';
// Public verification key supplied by the app owner. No signing secret is used.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEznzoC7/tz6QQIhlWh3KNlBn6fBhtnJDlCWhtaR7PhyRFMabKnZ65FFmM/97K/m9leiCDahZV6XKDCVEUNlgkLA==
-----END PUBLIC KEY-----`;
let key;
export async function authenticate(request, verificationKey) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ') || authorization.length > 16384) throw new Error('Sign in again to prepare your payment.');
  const { payload, protectedHeader } = await jwtVerify(authorization.slice(7), verificationKey || await (key ||= importSPKI(PUBLIC_KEY, 'ES256')), {
    algorithms: ['ES256'], issuer: 'privy.io', audience: APP_ID,
    requiredClaims: ['sub', 'sid', 'iat', 'exp'], maxTokenAge: 3600,
  });
  if (payload.aud !== APP_ID || !/^did:privy:[a-zA-Z0-9_-]{1,128}$/.test(payload.sub)
      || typeof payload.sid !== 'string' || !payload.sid || payload.sid.length > 256
      || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
      || payload.exp <= payload.iat || payload.exp - payload.iat > 3600
      || (protectedHeader.typ !== undefined && protectedHeader.typ !== 'JWT')
      || 'linked_accounts' in payload) throw new Error('Invalid access token.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`honeybee:count:v1:${APP_ID}:${payload.sub}`));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
