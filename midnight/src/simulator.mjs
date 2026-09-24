// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 McLean Lipschutz
// Uses the compiler-generated contract and the official Compact runtime.
// Runtime-context pattern: midnightntwrk/example-counter (Apache-2.0),
// Copyright Midnight Foundation. This is local simulation, not a ZK proof.
import { randomBytes } from 'node:crypto';
import { verifyBuild } from './verify-build.mjs';
import {
  createConstructorContext, createCircuitContext, sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
// Verify before executing generated JavaScript, including every key for a full build.
verifyBuild({ requireFull: false });
const { Contract, ledger, pureCircuits } = await import('../managed/approval/contract/index.js');

export const bytes32 = () => new Uint8Array(randomBytes(32));
export const witnesses = {
  ownerSecret: ({ privateState }) => [privateState, privateState.ownerSecret],
};

export class ApprovalSimulator {
  constructor({ ownerSecret = bytes32(), instanceId = bytes32() } = {}) {
    this.contract = new Contract(witnesses);
    const initial = this.contract.initialState(
      createConstructorContext({ ownerSecret }, '0'.repeat(64)),
      pureCircuits.ownerKey(ownerSecret, instanceId), instanceId,
    );
    this.context = createCircuitContext(
      sampleContractAddress(), initial.currentZswapLocalState,
      initial.currentContractState, initial.currentPrivateState,
    );
  }

  get state() { return ledger(this.context.currentQueryContext.state); }

  commitment(invoice, salt) {
    return pureCircuits.invoiceCommitment(this.state.instance, invoice, salt);
  }

  execute(action, invoice, salt, ownerSecret = this.context.currentPrivateState.ownerSecret) {
    if (!['approve', 'consume'].includes(action)) throw new Error('Unsupported action');
    const result = this.contract.impureCircuits[action]({
      ...this.context,
      currentPrivateState: { ownerSecret },
    }, invoice, salt);
    this.context = result.context;
    return result;
  }

  publicSnapshot() {
    const state = this.state;
    const hex = (value) => Buffer.from(value).toString('hex');
    return {
      authority: hex(state.authority), instance: hex(state.instance),
      approved: [...state.approved].map(hex), consumed: [...state.consumed].map(hex),
    };
  }
}

export function sampleInvoice() {
  return {
    invoiceId: bytes32(), recipient: bytes32(), asset: bytes32(),
    chainId: 11155111n, amount: 1_000_000n, maximum: 2_000_000n, expiresAt: BigInt(Date.now() + 300_000),
  };
}
