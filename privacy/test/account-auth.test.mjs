import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountAuthenticator } from '../src/account-auth.mjs';
import { accountFixture } from './account-fixture.mjs';

test('account authentication binds verified subject and app, independently of session ID', async () => {
  const fixture = await accountFixture();
  const authenticate = await createAccountAuthenticator(fixture);
  const buyer = await authenticate(await fixture.token());
  const later = await authenticate(await fixture.token('buyer', { sid: 'another-session' }));
  assert.equal(buyer.ownerId, later.ownerId);
  assert.notEqual(buyer.ownerId, (await authenticate(await fixture.token('merchant'))).ownerId);
  const otherApp = await createAccountAuthenticator({ ...fixture, appId: 'another-app' });
  assert.notEqual(buyer.ownerId, (await otherApp(await fixture.token('buyer', { aud: 'another-app' }))).ownerId);
  assert.equal(Object.isFrozen(buyer), true);
  assert.equal('sub' in buyer, false);
});

test('authentication rejects forged, expired, wrong-app, wrong-issuer and identity tokens', async () => {
  const fixture = await accountFixture();
  const authenticate = await createAccountAuthenticator(fixture);
  const other = await accountFixture();
  const valid = await fixture.token();
  const parts = valid.split('.');
  const now = Math.floor(Date.now() / 1000);
  const tokens = [undefined, '', 'x'.repeat(16385),
    await other.token(),
    `${parts[0]}.${Buffer.from(JSON.stringify({ sub: 'did:privy:attacker' })).toString('base64url')}.${parts[2]}`,
    `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${parts[1]}.`,
  ];
  for (const claims of [{ aud: 'another-app' }, { aud: [fixture.appId, 'another-app'] },
    { iss: 'attacker.example' }, { exp: now }, { iat: now + 30 },
    { nbf: now + 30 }, { exp: now + 7200 }, { sid: null }, { sub: '../../merchant' },
    { linked_accounts: '[]' }, { custom_metadata: '{}' }, { exp: null }]) {
    tokens.push(await fixture.token('buyer', claims));
  }
  tokens.push(await fixture.token('buyer', {}, { typ: 'id-token' }));
  for (const token of tokens) await assert.rejects(authenticate(token), { message: 'Account authentication failed' });
});
