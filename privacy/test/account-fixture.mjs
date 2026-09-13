import { generateKeyPair, exportSPKI, SignJWT } from 'jose';

// Local test issuer only. No production verification key or live login token.
export async function accountFixture(appId = 'honeybee-local-test') {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  return { appId, verificationKey: await exportSPKI(publicKey),
    async token(subject = 'buyer', claims = {}, header = {}) {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({ iss: 'privy.io', aud: appId, sub: `did:privy:${subject}`,
        sid: 'local-test-session', iat: now, exp: now + 3600, ...claims })
        .setProtectedHeader({ alg: 'ES256', typ: 'JWT', ...header }).sign(privateKey);
    } };
}
