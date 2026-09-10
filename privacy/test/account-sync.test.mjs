import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { TXIDVersion } from '@railgun-community/shared-models';
import { accountSyncConfig, scanAccountWallet, accountSyncToken } from '../src/account-sync.mjs';
import { createAccountWalletService } from '../src/account-wallets.mjs';
import { createAccountAuthenticator } from '../src/account-auth.mjs';
import { accountFixture } from './account-fixture.mjs';

const chain = { type: 0, id: 11155111 }, wallet = { id: 'only-this-account' };
const prepared = { rpcURL: 'http://127.0.0.1:9999', deployment: { status: 'reviewed-deployment-and-circuit-matched' } };
function fixture({ incomplete = false, otherWallet = false, units = 7000000n, onRead = () => {} } = {}) {
  let utxo, txid, balance, reads = 0;
  return {
    setOnUTXOMerkletreeScanCallback: fn => { utxo = fn; },
    setOnTXIDMerkletreeScanCallback: fn => { txid = fn; },
    setOnBalanceUpdateCallback: fn => { balance = fn; },
    loadProvider: async (_config, network) => assert.equal(network, 'Ethereum_Sepolia'),
    refreshBalances: async (receivedChain, ids) => {
      assert.deepEqual(receivedChain, chain); assert.deepEqual(ids, [wallet.id]);
      utxo({ chain, scanStatus: 'Complete' }); txid({ chain, scanStatus: incomplete ? 'Incomplete' : 'Complete' });
      balance({ railgunWalletID: otherWallet ? 'another-account' : wallet.id, chain, txidVersion: TXIDVersion.V2_PoseidonMerkle });
    },
    walletForID: id => { assert.equal(id, wallet.id); return wallet; },
    balanceForERC20Token: async (version, selected, network, token, onlySpendable) => {
      reads++; assert.equal(version, TXIDVersion.V2_PoseidonMerkle); assert.equal(selected, wallet);
      assert.equal(token, accountSyncToken); assert.equal(onlySpendable, true); onRead(); return units;
    },
    reads: () => reads,
  };
}
const scan = (sdk, extra = {}) => scanAccountWallet({ sdk, wallet, prepared, checkSession: () => {}, signal: AbortSignal.timeout(1000), ...extra });
test('account scan waits for both histories and its own balance update, returning only a locked-wallet snapshot', async () => {
  const result = await scan(fixture());
  assert.equal(result.synchronization.status, 'history-scans-complete');
  assert.deepEqual(result.synchronization.scans, { utxo: 'Complete', txid: 'Complete' });
  assert.equal(result.spendableBalance.amountUnits, '7000000');
  assert.equal(result.spendableBalanceVerified, true); assert.equal(result.paymentReady, false);
  assert.deepEqual(result.blockers, ['private-payment-not-integrated']);
  const empty = await scan(fixture({ units: 0n }));
  assert.equal(empty.spendableBalance.amountUnits, '0');
  assert.ok(empty.blockers.includes('no-spendable-test-usdc'));
});
test('incomplete histories, another wallet, expired sessions, cancellation and invalid balances fail closed', async () => {
  const incomplete = fixture({ incomplete: true });
  await assert.rejects(scan(incomplete), /Incomplete/); assert.equal(incomplete.reads(), 0);
  const other = fixture({ otherWallet: true });
  await assert.rejects(scan(other, { signal: AbortSignal.timeout(20) })); assert.equal(other.reads(), 0);
  await assert.rejects(scan(fixture(), { checkSession: () => { throw Error('Expired'); } }), /Expired/);
  let current = true;
  await assert.rejects(scan(fixture({ onRead: () => { current = false; } }), { checkSession: () => { if (!current) throw Error('Expired'); } }), /Expired/);
  await assert.rejects(scan(fixture({ units: -1n })), /balance unavailable/);
  const controller = new AbortController(); controller.abort();
  const cancelled = fixture(); await assert.rejects(scan(cancelled, { signal: controller.signal })); assert.equal(cancelled.reads(), 0);
});
test('sync endpoint configuration cannot come from a request or select non-HTTP services', () => {
  for (const config of [null, { rpcURL: 'file:///tmp/wallet' }, { rpcURL: 'http://remote.test' },
    { rpcURL: 'https://rpc.example', poiURL: 'http://poi.example' }, { rpcURL: 'https://rpc.example', walletId: 'another-account' }]) {
    assert.throws(() => accountSyncConfig(config));
  }
  assert.equal(accountSyncConfig({ rpcURL: 'https://rpc.example' }).poiURL, 'https://ppoi.fdi.network');
});
test('real account workers reject unauthorized sync before network access and preserve recovery on preflight failure', { timeout: 45000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'honeybee-account-sync-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const rpc = createServer((req, res) => {
    const chunks = []; req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => { calls++; const request = JSON.parse(Buffer.concat(chunks)); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: '0x1' })); });
  });
  await new Promise(resolve => rpc.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => rpc.close(resolve)));
  const auth = await accountFixture(), token = await auth.token(), other = await auth.token('merchant');
  const password = randomBytes(24).toString('hex');
  const service = await createAccountWalletService({ directory, ...auth, syncConfig: { rpcURL: `http://127.0.0.1:${rpc.address().port}` } });
  const created = await service.execute({ action: 'create', accessToken: token, password });
  await assert.rejects(service.execute({ action: 'sync', accessToken: 'forged', password }));
  await assert.rejects(service.execute({ action: 'sync', accessToken: other, password }));
  await assert.rejects(service.execute({ action: 'sync', accessToken: token, password: 'wrong-password-has-sixteen-characters' }));
  await assert.rejects(service.execute({ action: 'sync', accessToken: token, password, rpcURL: 'https://other.test' }));
  assert.equal(calls, 0);
  // Wrong-chain RPC is local and deterministic. No external network or payment.
  await assert.rejects(service.execute({ action: 'sync', accessToken: token, password }));
  assert.equal(calls, 1);
  const owner = (await (await createAccountAuthenticator(auth))(token)).ownerId;
  assert.equal(await readFile(join(directory, owner, 'account.backup.json'), 'utf8'), created.encryptedBackup);
  const checked = await service.execute({ action: 'unlock', accessToken: token, password });
  assert.deepEqual(checked.privateWallet, created.privateWallet);
  assert.equal(checked.spendableBalanceVerified, false); assert.equal(checked.paymentReady, false);
});
