import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createAccountWalletClient, isLocalDemo, readRecoveryFile } from './account-client.mjs';
import { formatUnits } from 'viem';

const actionNames = { create: 'Create private wallet', restore: 'Restore my wallet',
  unlock: 'Check my wallet', backup: 'Prepare recovery download', 'verify-backup': 'Verify saved backup', sync: 'Sync private balance' };

export function PrivateWalletPanel({ connection, runtime }) {
  const accountId = connection?.ready && connection?.authenticated ? connection.userId : null;
  const latest = useRef(connection); latest.current = connection;
  const alive = useRef(true), controller = useRef(null), inFlight = useRef(false);
  const formRef = useRef(null);
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('create'), [message, setMessage] = useState('');
  const [download, setDownload] = useState(''), [uncertain, setUncertain] = useState(false);
  const supported = runtime?.mode === 'local-testnet' && isLocalDemo(window.location.origin);
  const client = useMemo(() => supported && accountId ? createAccountWalletClient({
    origin: window.location.origin, getAccessToken: () => latest.current.getAccessToken(),
    isCurrent: () => alive.current && latest.current?.authenticated && latest.current.userId === accountId,
  }) : null, [supported, accountId]);
  useEffect(() => () => { alive.current = false; controller.current?.abort(); formRef.current?.reset(); }, []);
  const perform = async (action, fields = {}) => {
    if (!client || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    if (action === 'sync') {
      setResult(previous => previous ? { ...previous, synchronization: null, spendableBalance: null, spendableBalanceVerified: false } : previous);
      setMessage('Checking private wallet history and spendable test USDC. This can take up to two minutes.');
    }
    controller.current = new AbortController();
    try {
      const next = await client.execute(action, fields, controller.current.signal);
      if (!alive.current) return;
      setResult(next); setUncertain(false);
      setMode(next.privateWallet.status === 'not-created' ? 'create' : 'unlock');
      if (next.encryptedBackup) setDownload(next.encryptedBackup);
      if (action === 'create') setMessage('Wallet created. Download your encrypted backup and keep its password separately.');
      else if (action === 'restore') setMessage('Your private wallet was restored for this account.');
      else if (action === 'verify-backup') setMessage('Recovery copy verified. It opens the wallet saved for this account.');
      else if (action === 'unlock') setMessage('Wallet and recovery password checked. The wallet is now locked again.');
      else if (action === 'sync') setMessage('Private wallet history checked. The balance below is a snapshot; the wallet is locked again.');
    } catch (error) {
      if (alive.current) {
        setMessage(error.message);
        if (['create', 'restore'].includes(action)) setUncertain(true);
      }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { if (client) void perform('status'); }, [client]);
  const submit = async event => {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget, values = new FormData(form);
    const password = values.get('password'), repeated = values.get('repeat');
    const file = values.get('backup');
    form.reset(); setMessage('');
    if (mode === 'create' && password !== repeated) { setMessage('The recovery passwords did not match. Please enter them again.'); return; }
    try {
      const fields = { password };
      if (['restore', 'verify-backup'].includes(mode)) fields.backup = await readRecoveryFile(file);
      if (!alive.current) return;
      await perform(mode, fields);
    } catch (error) { if (alive.current) setMessage(error.message); }
  };
  const saveBackup = () => {
    const url = URL.createObjectURL(new Blob([download], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = 'honeybee-testnet-recovery.json'; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const existing = result?.privateWallet.status === 'locked';
  return <section className="checkout wallet-panel" aria-labelledby="wallet-heading">
    <div className="card-top"><span className="eyebrow">YOUR HONEYBEE WALLET</span><span className="pill">Testnet setup</span></div>
    <h2 id="wallet-heading">Create here. Keep a recovery copy.</h2>
    <p className="subtext">Sign in, set up your private wallet, and save an encrypted backup.</p>
    <ol className="steps" aria-label="Wallet setup steps"><li className={!accountId ? 'selected' : ''}>1. Sign in</li><li className={accountId && !existing ? 'selected' : ''}>2. Create</li><li className={existing ? 'selected' : ''}>3. Back up</li></ol>
    <div className="wallet-row"><div><span className="label">HONEYBEE ACCOUNT</span><strong>{accountId ? 'Signed in' : 'Sign in with email'}</strong></div>
      <button className="secondary" disabled={!connection?.ready || busy} onClick={() => accountId ? connection.logout() : connection.login()}>{accountId ? 'Sign out' : 'Create account / sign in'}</button></div>
    {!connection && <p className="notice">Sign-in is available after the local demo has its Privy app configuration.</p>}
    {!supported && <p className="notice">Private wallet setup is available in the local testnet demo. This preview cannot create a private wallet.</p>}
    <p className="local-note"><strong>Local testnet demo.</strong> This computer’s payment runtime handles wallet keys and recovery passwords. Use test wallets and test assets only.</p>
    {accountId && supported && <>
      <div className="wallet-toolbar"><strong>{busy ? 'Checking wallet…' : !result ? 'Wallet status unavailable' : existing ? 'Private wallet saved' : 'Create or restore your wallet'}</strong><button className="text-button" disabled={busy} onClick={() => perform('status')}>Refresh status</button></div>
      {result?.privateWallet.privateAddress && <details className="wallet-details"><summary>Private wallet address</summary><code>{result.privateWallet.privateAddress}</code><p>Private payments are not enabled yet. This is not a public funding address.</p></details>}
      {result && <>
        <div className="wallet-actions" role="group" aria-label="Private wallet actions">
          {(existing ? ['unlock', 'backup', 'verify-backup', ...(runtime?.accountSyncEnabled ? ['sync'] : [])] : ['create', 'restore']).map(action => <button key={action} type="button" className="secondary" aria-pressed={mode === action} disabled={busy} onClick={() => { setMode(action); formRef.current?.reset(); setMessage(''); }}>{actionNames[action]}</button>)}
        </div>
        <form ref={formRef} onSubmit={submit} key={mode}>
          {['restore', 'verify-backup'].includes(mode) && <><label htmlFor="recovery-file">Encrypted Honeybee backup</label><input id="recovery-file" name="backup" type="file" accept="application/json,.json" required disabled={busy}/></>}
          <label htmlFor="recovery-password">{mode === 'create' ? 'Choose a recovery password' : 'Recovery password'}</label>
          <input id="recovery-password" name="password" type="password" minLength={16} maxLength={256} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} required disabled={busy}/>
          {mode === 'create' && <><label htmlFor="repeat-password">Repeat recovery password</label><input id="repeat-password" name="repeat" type="password" minLength={16} maxLength={256} autoComplete="new-password" required disabled={busy}/></>}
          <p className="hint">Use at least 16 characters. Recovery needs this Honeybee account, your backup file and its password. Email sign-in alone cannot recover this wallet.</p>
          <button className="primary" disabled={busy || uncertain}>{busy ? 'Working…' : actionNames[mode]}</button>
        </form>
      </>}
      {result?.spendableBalanceVerified && result.spendableBalance && <div className="notice">
        <strong>{formatUnits(BigInt(result.spendableBalance.amountUnits), 6)} test USDC available privately</strong>
        <p>Checked {new Date(result.synchronization.checkedAt).toLocaleString()}. This is a snapshot of spendable private funds, separate from your public wallet balance.</p>
        <p>{result.spendableBalance.amountUnits === '0' ? 'No spendable test USDC was found. Private funding is the next step.' : 'Private payment checkout is still being built.'}</p>
      </div>}
      {download && <div className="notice protected"><strong>Your encrypted recovery copy is ready.</strong><p>Save it somewhere you can access if this device is lost. Then use “Verify saved backup” to check your saved file.</p><button className="secondary" onClick={saveBackup} disabled={busy}>Download encrypted backup</button></div>}
    </>}
    {message && <p className="status" role="status">{message}</p>}
    <p className="kyc-note">Identity verification is deferred for this testnet demo. Signing in does not mean your identity has been verified.</p>
    <div className="card-bottom"><span>Wallet setup only</span><span>Private payments coming next</span></div>
  </section>;
}
