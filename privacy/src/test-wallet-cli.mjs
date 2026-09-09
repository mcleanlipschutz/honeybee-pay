import { resolve } from 'node:path';
import { readSecret } from './secret-input.mjs';
import { initializeTestWorkspace, inspectTestWorkspace } from './test-workspace.mjs';

try {
  const [action, directory, backup] = process.argv.slice(2);
  if (!['init', 'status', 'restore'].includes(action) || !directory
      || (action === 'restore' && !backup) || (action !== 'restore' && backup)) {
    throw new Error('Usage: wallet init|status DIRECTORY, or wallet restore DIRECTORY BACKUP');
  }
  const password = await readSecret();
  if (process.stdin.isTTY && action === 'init') {
    if (await readSecret('Repeat password: ') !== password) throw new Error('Passwords did not match');
  }
  const result = action === 'status' ? await inspectTestWorkspace(resolve(directory), password)
    : await initializeTestWorkspace(resolve(directory), password, backup ? resolve(backup) : undefined);
  console.log(JSON.stringify(result, null, 2));
} catch {
  console.error('Test wallet command failed. Check command syntax, password, backup and workspace path. Existing workspaces are never overwritten.');
  process.exitCode = 1;
}
