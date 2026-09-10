import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createAccountWalletClient, isLocalDemo, readRecoveryFile } from './account-client.mjs';
import { formatUnits } from 'viem';
import { shieldAmountUnits } from './shield-review.mjs';

const actionNames = { create: 'Create private wallet', restore: 'Restore my wallet',
  unlock: 'Check my wallet', backup: 'Prepare recovery download', 'verify-backup': 'Verify saved backup', sync: 'Sync private balance', 'shield-review': 'Review test deposit' };

export function PrivateWalletPanel({ connection, runtime }) {
  const accountId = connection?.ready && connection?.authenticated ? connection.userId : null;
  const latest = useRef(connection); latest.current = connection;
  const alive = useRef(true), controller = useRef(null), inFlight = useRef(false);
  const formRef = useRef(null);
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('create'), [message, setMessage] = useState('');
  const [download, setDownload] = useState(''), [uncertain, setUncertain] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const supported = runtime?.mode === 'local-testnet' && isLocalDemo(window.location.origin);
  const client = useMemo(() => supported && accountId ? createAccountWalletClient({
    origin: window.location.origin, getAccessToken: () => latest.current.getAccessToken(),
    isCurrent: () => alive.current && latest.current?.authenticated && latest.current.userId === accountId,
  }) : null, [supported, accountId]);
  useEffect(() => () => { alive.current = false; controller.current?.abort(); formRef.current?.reset(); }, []);
  useEffect(() => {
    if (!result?.shieldReview) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [result?.shieldReview]);
  const perform = async (action, fields = {}) => {
    if (!client || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    setResult(previous => previous ? { ...previous, shieldReview: null } : previous);
    if (action === 'sync') {
      setResult(previous => previous ? { ...previous, synchronization: null, spendableBalance: null, spendableBalanceVerified: false } : previous);
      setMessage('Checking private wallet history and spendable test USDC. This can take up to two minutes.');
    }
    if (action === 'shield-review') setMessage('Checking the test deposit amount, protocol fee and allowance. This can take up to two minutes.');
    controller.current = new AbortController();
    try {
      const next = await client.execute(action, fields, controller.current.signal);
      if (!alive.current) return;
      if (action === 'shield-review' && fields.publicAddress?.toLowerCase() !== latest.current.wallet?.address?.toLowerCase()) {
        setMessage('Your funding wallet changed. Review the deposit again.'); return;
      }
      setResult(next); setUncertain(false);
      setClock(Date.now());
      setMode(next.privateWallet.status === 'not-created' ? 'create' : 'unlock');
      if (next.encryptedBackup) setDownload(next.encryptedBackup);
      if (action === 'create') setMessage('Wallet created. Download your encrypted backup and keep its password separately.');
      else if (action === 'restore') setMessage('Your private wallet was restored for this account.');
      else if (action === 'verify-backup') setMessage('Recovery copy verified. It opens the wallet saved for this account.');
      else if (action === 'unlock') setMessage('Wallet and recovery password checked. The wallet is now locked again.');
      else if (action === 'sync') setMessage('Private wallet history checked. The balance below is a snapshot; the wallet is locked again.');
      else if (action === 'shield-review') setMessage('Deposit review prepared. Your wallet is locked again. No funds were moved.');
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
      if (mode === 'shield-review') {
        fields.amount = values.get('amount'); fields.publicAddress = latest.current.wallet?.address;
        shieldAmountUnits(fields.amount);
        if (!fields.publicAddress) throw new Error('Wait for your public wallet to connect, then review the deposit.');
      }
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
  const copyAddress = async address => {
    try { await navigator.clipboard.writeText(address); if (alive.current) setMessage('Address copied.'); }
    catch { if (alive.current) setMessage('Copy was unavailable. Select the address and copy it manually.'); }
  };
  const existing = result?.privateWallet.status === 'locked';
  const review = result?.shieldReview;
  const reviewCurrent = review && clock < review.expiresAt
    && connection?.wallet?.address?.toLowerCase() === review.publicAddress.toLowerCase();
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
          {(existing ? ['unlock', 'backup', 'verify-backup', ...(runtime?.accountSyncEnabled ? ['sync'] : []), ...(runtime?.shieldReviewEnabled ? ['shield-review'] : [])] : ['create', 'restore']).map(action => <button key={action} type="button" className="secondary" aria-pressed={mode === action} disabled={busy} onClick={() => { setMode(action); formRef.current?.reset(); setMessage(''); setResult(previous => ({ ...previous, shieldReview: null })); }}>{actionNames[action]}</button>)}
        </div>
        <form ref={formRef} onSubmit={submit} key={mode}>
          {mode === 'shield-review' && <>
            <label htmlFor="shield-amount">Test USDC to move into your private wallet</label>
            <input id="shield-amount" name="amount" type="text" inputMode="decimal" defaultValue="1.00" maxLength={16} required disabled={busy}/>
            <p className="hint">Maximum 10 test USDC. Test assets have no real-money value. This prepares a review only.</p>
          </>}
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
      {review && <div className="notice" aria-label="Test deposit review">
        <strong>{reviewCurrent ? 'Review your test deposit' : 'This deposit review has expired or your funding wallet changed.'}</strong>
        {reviewCurrent ? <>
          <p>From your public wallet: {formatUnits(BigInt(review.amountUnits), 6)} test USDC</p>
          <p>Protocol fee: {formatUnits(BigInt(review.feeUnits), 6)} test USDC</p>
          <p>Expected in your private wallet: {formatUnits(BigInt(review.receivedUnits), 6)} test USDC</p>
          <p>{review.approvalRequired ? `A separate approval for exactly ${formatUnits(BigInt(review.amountUnits), 6)} test USDC would be needed.` : 'An existing allowance covers this amount at the reviewed block.'}</p>
          <p>Network fee: not estimated yet. This is a finalized-block snapshot and needs a fresh check before signing.</p>
          <details className="wallet-details"><summary>Funding wallet and destination</summary>
            <p>Public funding wallet</p><code>{review.publicAddress}</code>
            <button type="button" className="text-button" onClick={() => copyAddress(review.publicAddress)}>Copy funding address</button>
            <a href={`https://sepolia.etherscan.io/address/${review.publicAddress}`} target="_blank" rel="noopener noreferrer">View public wallet on Sepolia</a>
            <p>Your private wallet</p><code>{review.privateAddress}</code>
            <button type="button" className="text-button" onClick={() => copyAddress(review.privateAddress)}>Copy private address</button>
          </details>
          <p>A shield deposit exposes the public funding wallet, token, amount and timing. Funds become spendable privately only after confirmation and a successful wallet scan.</p>
          <p>Approval and deposit submission are not enabled in this build. Wallet confirmation and live deposit verification come next.</p>
        </> : <p>Choose “Review test deposit” again to check fresh terms.</p>}
      </div>}
      {download && <div className="notice protected"><strong>Your encrypted recovery copy is ready.</strong><p>Save it somewhere you can access if this device is lost. Then use “Verify saved backup” to check your saved file.</p><button className="secondary" onClick={saveBackup} disabled={busy}>Download encrypted backup</button></div>}
    </>}
    {message && <p className="status" role="status">{message}</p>}
    <p className="kyc-note">Identity verification is deferred for this testnet demo. Signing in does not mean your identity has been verified.</p>
    <div className="card-bottom"><span>Wallet setup only</span><span>Private payments coming next</span></div>
  </section>;
}
