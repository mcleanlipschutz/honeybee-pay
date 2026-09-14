// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 McLean Lipschutz
// Uses the compiler-generated contract and the official Compact runtime.
// Runtime-context pattern: midnightntwrk/example-counter (Apache-2.0),
// Copyright Midnight Foundation. This is local simulation, not a ZK proof.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createConstructorContext, createCircuitContext, sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger, pureCircuits } from '../managed/approval/contract/index.js';

const build = JSON.parse(readFileSync(new URL('../managed/approval/build.json', import.meta.url)));
const source = readFileSync(new URL('../contracts/approval.compact', import.meta.url));
const generated = readFileSync(new URL('../managed/approval/contract/index.js', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (build.sourceSha256 !== sha256(source) || build.artifacts['contract/index.js'] !== sha256(generated)) {
  throw new Error('Compact artifacts are stale or changed. Run npm run compile before testing.');
}

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
    chainId: 11155111n, amount: 1_000_000n, maximum: 2_000_000n,
  };
}
