import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeEventTopics, encodeAbiParameters, decodeFunctionData, erc20Abi } from 'viem';
import { approvePayment, buildTransfer, verifyReceipt, USDC, CHAIN_ID } from '../src/payment.mjs';
const sender = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const approval = () => approvePayment({ sender, recipient, amount: '1.000001' }, 1000);
test('approval captures exact USDC units and builds only the reviewed token transfer', () => {
  const a = approval(); assert.ok(Object.isFrozen(a)); assert.equal(a.amountUnits, '1000001');
  const tx = buildTransfer(a, a, sender, 2000);
  assert.equal(tx.to, USDC); assert.equal(tx.chainId, CHAIN_ID); assert.equal(tx.value, 0n);
  const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
  assert.equal(decoded.functionName, 'transfer'); assert.deepEqual(decoded.args, [recipient, 1000001n]);
});
test('changed recipient, amount, token, chain, wallet and expiry fail before wallet access', () => {
  const a = approval();
  for (const [key, value] of Object.entries({ recipient: sender, sender: recipient, amountUnits: '2', token: sender, chainId: 1, expiresAt: 999999 })) {
    assert.throws(() => buildTransfer(a, { ...a, [key]: value }, sender, 2000));
  }
  assert.throws(() => buildTransfer(a, a, recipient, 2000));
  assert.throws(() => buildTransfer(a, a, sender, a.expiresAt));
});
test('invalid recipients and ambiguous or excessive amounts are rejected', () => {
  for (const amount of ['0', '-1', '1e0', '1,00', '1.0000001', '10.01', '01', ' 1']) assert.throws(() => approvePayment({sender,recipient,amount}));
  for (const address of [sender, '0x0000000000000000000000000000000000000000', '0zkfake']) assert.throws(() => approvePayment({sender,recipient:address,amount:'1'}));
});
const log = (to = recipient, token = USDC, amount = 1000001n) => ({ address: token,
  topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: sender, to } }),
  data: encodeAbiParameters([{ type: 'uint256' }], [amount]) });
test('receipt requires the matching USDC event, sender, recipient, amount and successful execution', () => {
  const a = approval();
  const r = { status: 'success', logs: [log()], transactionHash: '0xabc', blockNumber: 123n };
  assert.equal(verifyReceipt(r, a).blockNumber, '123');
  for (const logs of [[], [log(sender)], [log(recipient, sender)], [log(recipient, USDC, 1n)], [log(), log()]]) assert.throws(() => verifyReceipt({ ...r, logs }, a));
  assert.throws(() => verifyReceipt({ ...r, status: 'reverted' }, a));
});
