import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentFixture, hash, word } from './payment-fixture.mjs';
import { createPaymentStore } from '../src/payment-store.mjs';
import { paymentNeedsCompatibilityProof } from '../src/payment-verification.mjs';
import { relayInterface } from '../src/deployment-check.mjs';

const legacy = async t => {
  const f = await paymentFixture(t);
  f.state.legacyRelay = true;
  const quote = (await f.run('payment-quote')).privatePayment.quote;
  f.state.sendFailure = true;
  await f.run('payment-submit', { quoteId: quote.quoteId });
  const old = (await f.store.read()).payments[0];
  const proofArgs = structuredClone(f.state.proofArgs.slice(0, -1));
  const originals = structuredClone({ populated: f.state.populated, struct: f.state.struct, structs: f.state.structs });
  f.state.legacyRelay = false;
  f.state.changeProof = tx => { tx.commitments = [word('de'), word('ef')]; };
  return Object.assign(f, { quote, old, proofArgs, originals,
    review: extra => f.run('payment-redelivery-review', { quoteId: quote.quoteId, ...extra }),
    retry: (r, extra) => f.run('payment-redelivery-submit', { quoteId: quote.quoteId, reviewId: r.reviewId, ...extra }),
    status: extra => f.run('payment-status', { quoteId: quote.quoteId, ...extra }),
  });
};

test('legacy recovery prepares only one compatible proof for both original inputs and requires fresh explicit consent', async t => {
  const f = await legacy(t), stages = [];
  const r = (await f.review({ onStage: (stage, reason) => stages.push([stage, reason]) })).deliveryReview;
  const reviewed = (await f.store.read()).payments[0];
  assert.equal(r.version, 2); assert.equal(r.deliveryKind, 'compatible-proof');
  assert.equal(f.state.sends, 1); assert.equal(f.state.proofs, 2);
  assert.ok(stages.some(([s, r]) => s === 'compatibility-check' && r === 'ORIGINAL_NOTES_MATCHED'));
  assert.deepEqual(f.state.proofArgs.slice(0, -1), f.proofArgs);
  assert.equal(paymentNeedsCompatibilityProof(reviewed.populated), true);
  assert.equal(paymentNeedsCompatibilityProof(reviewed.compatiblePopulated), false);
  assert.equal(reviewed.compatibleDeliveryAuthorized, undefined);
  for (const k of ['quote', 'gas', 'broadcaster', 'populated']) assert.deepEqual(reviewed[k], f.old[k]);
  await f.run('payment-history'); await f.status();
  assert.equal(f.state.sends, 1); assert.equal(f.state.proofs, 2);
  const r2 = (await f.review()).deliveryReview;
  assert.notEqual(r2.reviewId, r.reviewId); assert.equal(f.state.proofs, 2);
  await assert.rejects(f.retry(r));
  let sent;
  const openBroadcaster = async () => ({ selected: f.selected, close: async () => {},
    create: async populated => {
      sent = populated;
      return { send: async () => {
        const saved = (await f.store.read()).payments[0];
        assert.equal(saved.compatibleDeliveryAuthorized, true);
        assert.equal(saved.deliveryReviewUsed, true);
        f.state.sends++; return hash;
      } };
    } });
  assert.equal((await f.retry(r2, { openBroadcaster })).privatePayment.status, 'pending');
  assert.deepEqual(sent, reviewed.compatiblePopulated);
  assert.deepEqual((await f.store.read()).payments[0].populated, f.old.populated);
  await assert.rejects(f.retry(r2)); assert.equal(f.state.sends, 2); assert.equal(f.state.proofs, 2);
});

test('a changed original tree or nullifier, incompatible action or failed scan/proof cannot save or deliver an alternative', async t => {
  for (const mode of ['first-nullifier', 'second-nullifier', 'first-tree', 'second-tree', 'legacy-flag', 'proof', 'scan']) {
    const f = await legacy(t);
    const paymentProver = { ...f.sdk, populateProvedTransfer: async (...args) => {
      const populated = await f.sdk.populateProvedTransfer(...args);
      if (mode === 'proof') f.state.acceptProof = false;
      const [txs, action] = relayInterface.decodeFunctionData('relay', populated.transaction.data).toArray(true);
      if (mode.endsWith('nullifier')) txs[mode.startsWith('first') ? 0 : 1][2] = [word('ee')];
      if (mode.endsWith('tree')) txs[mode.startsWith('first') ? 0 : 1][4][0] = 3n;
      if (mode === 'legacy-flag') action[1] = true;
      // Re-bind altered input tuples so the same-input check, not merely the
      // ABI/binding check, must reject these different spending authorities.
      const { bindingHash } = await import('../src/payment-verification.mjs');
      const rebound = txs.map(tx => ({ nullifiers: tx[2] }));
      const nextAction = { random: action[0], requireSuccess: action[1], minGasLimit: action[2], calls: action[3] };
      for (const tx of txs) tx[4][5] = bindingHash(rebound, nextAction);
      return { ...populated, transaction: { ...populated.transaction, data: relayInterface.encodeFunctionData('relay', [txs, action]) },
        nullifiers: txs.flatMap(tx => tx[2]) };
    } };
    if (mode === 'scan') f.state.scanComplete = false;
    await assert.rejects(f.review({ paymentProver }));
    const saved = (await f.store.read()).payments[0];
    assert.equal(saved.status, 'unknown'); assert.equal(saved.compatiblePopulated, undefined);
    assert.equal(saved.deliveryReview, undefined); assert.deepEqual(saved.populated, f.old.populated);
    assert.equal(f.state.sends, 1);
  }
});

test('original or authorized compatible calldata can settle, with canonical events required for the selected version', async t => {
  for (const which of ['original', 'compatible']) {
    const f = await legacy(t), r = (await f.review()).deliveryReview;
    await f.retry(r);
    if (which === 'original') Object.assign(f.state, f.originals);
    f.mined(); f.state.discoveredHash = hash;
    assert.equal((await f.status()).privatePayment.status, 'confirmed');
    assert.equal(f.state.sends, 2);
  }
});

test('an unsent compatible review never authorizes its receipt; original settlement still resolves and blocks confirmation', async t => {
  const f = await legacy(t), r = (await f.review()).deliveryReview;
  f.mined(); f.state.discoveredHash = hash;
  assert.equal((await f.status()).privatePayment.status, 'unknown');
  await assert.rejects(f.retry(r)); assert.equal(f.state.sends, 1);
  Object.assign(f.state, f.originals); f.mined();
  assert.equal((await f.status()).privatePayment.status, 'confirmed');
  await assert.rejects(f.retry(r));
});

test('events for the old outputs cannot confirm the compatible calldata', async t => {
  const f = await legacy(t), r = (await f.review()).deliveryReview;
  await f.retry(r);
  f.mined(); const compatibleTx = f.state.tx;
  Object.assign(f.state, f.originals); f.mined();
  f.state.tx = compatibleTx; f.state.discoveredHash = hash;
  assert.equal((await f.status()).privatePayment.status, 'unknown');
  assert.equal(f.state.sends, 2);
});

test('a pending or reverted compatible ACK cannot hide original settlement when SDK discovery is unavailable', async t => {
  for (const outcome of ['pending', 'reverted']) {
    const f = await legacy(t), r = (await f.review()).deliveryReview;
    const ack = word('cc'); f.state.sendFailure = false; f.state.ackHash = ack;
    await f.retry(r); f.mined();
    const compatibleTx = { ...f.state.tx, hash: ack };
    const compatibleReceipt = outcome === 'pending' ? null : { ...f.state.receipt, transactionHash: ack, status: '0x0', logs: [] };
    Object.assign(f.state, f.originals); f.mined();
    const rpc = async (method, params) => {
      if (method === 'eth_getTransactionByHash' && params[0] === ack) return compatibleTx;
      if (method === 'eth_getTransactionReceipt' && params[0] === ack) return compatibleReceipt;
      return f.rpc(method, params);
    };
    const result = await f.status({ prepared: { rpc, rpcURL: 'http://127.0.0.1:9999', deployment: {} } });
    assert.equal(result.privatePayment.status, 'confirmed');
    assert.equal(result.privatePayment.hash, hash);
    assert.equal(f.state.sends, 2);
  }
});

test('changed consent kind, old consent version and changed compatible payload cannot authorize delivery', async t => {
  for (const mode of ['kind', 'version', 'payload']) {
    const f = await legacy(t), r = (await f.review()).deliveryReview;
    const data = await f.store.read();
    if (mode === 'kind') data.payments[0].deliveryReview.deliveryKind = 'original-payload';
    if (mode === 'version') data.payments[0].deliveryReview.version = 1;
    if (mode === 'payload') data.payments[0].compatiblePopulated.preTransactionPOIsPerTxidLeafPerList = { changed: true };
    await f.store.write(data);
    await assert.rejects(f.retry(r)); assert.equal(f.state.sends, 1);
  }
});

test('compatible review refreshes the same signed offer after proving and refuses changed fees', async t => {
  for (const changed of [false, true]) {
    const f = await legacy(t);
    const current = structuredClone(f.selected); current.tokenFee.expiration += 100000;
    if (changed) current.tokenFee.feePerUnitGas = '0x2';
    const openBroadcaster = async () => ({ selected: f.selected, currentOffer: () => current, close: async () => {} });
    if (changed) await assert.rejects(f.review({ openBroadcaster }), /fee unavailable/);
    else assert.ok((await f.review({ openBroadcaster })).deliveryReview);
    assert.equal(f.state.sends, 1);
  }
});

test('a late compatible delivery ACK survives session expiry without losing either saved authorization', async t => {
  const f = await legacy(t), r = (await f.review()).deliveryReview;
  f.state.sendFailure = false; f.state.beforeSend = async () => { f.session.expiresAt = 1; };
  await f.retry(r);
  const store = createPaymentStore({ directory: f.directory, privateKey: f.privateKey, ownerId: f.session.ownerId, checkSession() {} });
  const saved = (await store.read()).payments[0];
  assert.equal(saved.candidateHash, hash); assert.equal(saved.compatibleDeliveryAuthorized, true);
  assert.deepEqual(saved.populated, f.old.populated); assert.ok(saved.compatiblePopulated);
});
