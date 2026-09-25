import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

// Passwords enter through a hidden terminal prompt or stdin, never flags/env.
export async function readSecret(prompt = 'Test-workspace password: ') {
  if (!process.stdin.isTTY) {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk.toString();
      if (Buffer.byteLength(input) > 4096) throw new Error('Password input too long');
    }
    return input.replace(/\r?\n$/, '');
  }
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input: process.stdin, output, terminal: true });
  process.stderr.write(prompt);
  try {
    return await new Promise((resolve, reject) => {
      reader.once('SIGINT', () => reject(new Error('Password entry cancelled')));
      reader.once('close', () => reject(new Error('Password entry ended')));
      reader.question('', resolve);
    });
  } finally { reader.close(); output.destroy(); process.stderr.write('\n'); }
}
