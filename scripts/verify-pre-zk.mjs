// Offline regression gate. It does not authenticate, prove, sign, or send funds.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some(a => a !== '--with-prover') || args.length > 1 || process.platform === 'win32') {
  console.error('Run node scripts/verify-pre-zk.mjs [--with-prover] on Linux, macOS or WSL.');
  process.exit(1);
}
for (const [directory, command] of [['midnight','test'],['privacy','test'],['checkout','test'],['checkout','build'],
  ...(args.includes('--with-prover') ? [['midnight','proof:preflight']] : [])]) {
  console.log(`Checking ${directory}: ${command}`);
  const result = spawnSync('npm', ['run', command], { cwd: root + directory, stdio: 'inherit', timeout: 180_000 });
  if (result.error || result.status !== 0) {
    console.error(`Stopped: ${directory} ${command} did not pass. No payment or proof integration is authorized.`);
    process.exit(result.status || 1);
  }
}
console.log('Regression gate passed. This is not evidence of a real ZK proof, deployment or private payment.');
