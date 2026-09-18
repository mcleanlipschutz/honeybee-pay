// SPDX-License-Identifier: Apache-2.0
import { verifyBuild } from '../src/verify-build.mjs';
import { checkProofService } from '../src/proof-readiness.mjs';

const report = { stage: 'proof-infrastructure-check', artifacts: null, prover: null,
  infrastructureReady: false, transactionProofVerified: false, walletConnected: false,
  networkDeployment: false, paymentSettlement: false, blockers: [] };
try { report.artifacts = verifyBuild(); }
catch { report.blockers.push('Run the full pinned Compact compilation; current artifacts did not pass verification.'); }
try {
  report.prover = await checkProofService({ url: process.env.HONEYBEE_PROOF_URL });
  if (!report.prover.ready) report.blockers.push('Start the pinned local proof server and rerun this check.');
} catch { report.blockers.push('The proof endpoint is not an allowed loopback-only URL.'); }
report.infrastructureReady = !!report.artifacts && !!report.prover?.ready;
// A green infrastructure check is NOT proof, deployment or payment evidence.
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.infrastructureReady ? 0 : 2;
