import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createAccountWalletClient, isLocalDemo, readRecoveryFile } from './account-client.mjs';
import { createHistoryBackupReader } from '../../shared/request-history-backup.mjs';
import { formatUnits } from 'viem';
import { shieldAmountUnits } from './shield-review.mjs';
import { PrivatePaymentRequests } from './PrivatePaymentRequests.jsx';
import { privateRequestAmount } from './private-request.mjs';
import { shieldConfirmationStep } from './shield-preflight.mjs';
import { DepositActivity } from './DepositActivity.jsx';

const actionNames = { create: 'Create private wallet', restore: 'Restore my wallet',
  unlock: 'Check my wallet', backup: 'Prepare recovery download', 'verify-backup': 'Verify saved backup', sync: 'Sync private balance', 'shield-review': 'Review test deposit', 'invoice-create': 'Create payment request', 'invoice-history': 'Open request history', 'invoice-history-export': 'Back up request history', 'invoice-history-restore': 'Restore request history' };

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
  const historyReader = useMemo(() => createHistoryBackupReader({
    isCurrent: () => alive.current && latest.current?.authenticated && latest.current.userId === accountId,
  }), [accountId]);
  useEffect(() => () => historyReader.clear(), [historyReader]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); formRef.current?.reset(); }; }, []);
  useEffect(() => {
    if (!result?.shieldReview) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [result?.shieldReview]);
  const perform = async (action, fields = {}) => {
    if (!client || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    const savedReview = action === 'shield-preflight' ? result?.shieldReview : null;
    setResult(previous => previous ? { ...previous, shieldReview: savedReview, shieldPreflight: null, paymentRequest: null, requestHistory: null, encryptedRequestHistory: null } : previous);
    if (action === 'sync') {
      setResult(previous => previous ? { ...previous, synchronization: null, spendableBalance: null, spendableBalanceVerified: false } : previous);
      setMessage('Checking private wallet history and spendable test USDC. This can take up to two minutes.');
    }
    if (action === 'shield-review') setMessage('Checking the test deposit amount, protocol fee and allowance. This can take up to two minutes.');
    if (action === 'shield-preflight') setMessage('Simulating the next transaction and checking its network fee. No wallet signature is requested.');
    controller.current = new AbortController();
    try {
      const next = action === 'shield-preflight' ? await client.preflight(savedReview, controller.current.signal)
        : await client.execute(action, fields, controller.current.signal);
      if (!alive.current) return;
      if (action === 'shield-review' && fields.publicAddress?.toLowerCase() !== latest.current.wallet?.address?.toLowerCase()) {
        setMessage('Your funding wallet changed. Review the deposit again.'); return;
      }
      if (savedReview && savedReview.publicAddress.toLowerCase() !== latest.current.wallet?.address?.toLowerCase()) {
        setMessage('Your funding wallet changed. Review the deposit again.'); return;
      }
      setResult(next); setUncertain(false);
      setClock(Date.now());
      setMode(next.privateWallet.status === 'not-created' ? 'create' : 'unlock');
      if (next.encryptedBackup) setDownload(next.encryptedBackup);
      if (action === 'create') setMessage('Wallet created. Download your encrypted backup and keep its password separately.');
      else if (action === 'invoice-create') setMessage('Payment request saved to this account’s encrypted local history. Your wallet is locked again.');
      else if (action === 'invoice-history-export') setMessage('Encrypted history backup ready. Keep it with your wallet recovery backup.');
      else if (action === 'invoice-history-restore') setMessage(`${next.historyRestoration.added} requests restored; ${next.historyRestoration.alreadySaved} already saved. ${next.historyRestoration.total} requests in this account’s history.`);
      else if (action === 'invoice-history') setMessage('Request history opened. Payment status has not been checked; these are not receipts.');
      else if (action === 'restore') setMessage('Your private wallet was restored for this account.');
      else if (action === 'verify-backup') setMessage('Recovery copy verified. It opens the wallet saved for this account.');
      else if (action === 'unlock') setMessage('Wallet and recovery password checked. The wallet is now locked again.');
      else if (action === 'sync') setMessage('Private wallet history checked. The balance below is a snapshot; the wallet is locked again.');
      else if (action === 'shield-review') setMessage('Deposit review prepared. Your wallet is locked again. No funds were moved.');
      else if (action === 'shield-preflight') setMessage('The next transaction was simulated and its fee checked. No funds were moved.');
    } catch (error) {
      if (alive.current) {
        setMessage(error.message);
        if (['create', 'restore'].includes(action)) setUncertain(true);
      }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { if (client) void perform('status'); }, [client]);
  const checkPayment = async (request, password, wallet, signal) => {
    if (!client || inFlight.current) throw new Error('Wait for the current wallet check to finish.');
    inFlight.current = true; setBusy(true);
    try { return await client.checkPayment(request, password, wallet, signal); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };
  const submit = async event => {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget, values = new FormData(form);
    const password = values.get('password'), repeated = values.get('repeat');
    const file = values.get('backup');
    const submittedMode = mode;
    inFlight.current = true; setBusy(true);
    form.reset(); setMessage('');
    if (mode === 'create' && password !== repeated) { setMessage('The recovery passwords did not match. Please enter them again.'); inFlight.current = false; setBusy(false); return; }
    try {
      const fields = { password };
      if (mode === 'shield-review') {
        fields.amount = values.get('amount'); fields.publicAddress = latest.current.wallet?.address;
        shieldAmountUnits(fields.amount);
        if (!fields.publicAddress) throw new Error('Wait for your public wallet to connect, then review the deposit.');
      }
      if (mode === 'invoice-create') {
        fields.amount = values.get('amount'); fields.lifetimeSeconds = Number(values.get('lifetime'));
        privateRequestAmount(fields.amount);
      }
      if (['restore', 'verify-backup'].includes(submittedMode)) fields.backup = await readRecoveryFile(file);
      if (submittedMode === 'invoice-history-restore') fields.historyBackup = await historyReader.read(values.get('historyBackup'));
      if (!alive.current || !latest.current?.authenticated || latest.current.userId !== accountId) return;
      inFlight.current = false;
      await perform(submittedMode, fields);
    } catch (error) { if (alive.current) setMessage(error.message); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
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
  const quote = result?.shieldPreflight;
  const quoteCurrent = quote && clock < quote.expiresAt;
  const confirmationStep = shieldConfirmationStep({ review, quote, publicAddress: connection?.wallet?.address,
    chainId: connection?.wallet?.chainId, now: clock });
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
          {(existing ? ['unlock', 'backup', 'verify-backup', ...(runtime?.accountSyncEnabled ? ['sync'] : []), ...(runtime?.shieldReviewEnabled ? ['shield-review'] : []), ...(runtime?.privateRequestsEnabled ? ['invoice-create', 'invoice-history', 'invoice-history-export', 'invoice-history-restore'] : [])] : ['create', 'restore']).map(action => <button key={action} type="button" className="secondary" aria-pressed={mode === action} disabled={busy} onClick={() => { historyReader.clear(); setMode(action); formRef.current?.reset(); setMessage(''); setResult(previous => ({ ...previous, shieldReview: null, paymentRequest: null, requestHistory: null, encryptedRequestHistory: null })); }}>{actionNames[action]}</button>)}
        </div>
        <form ref={formRef} onSubmit={submit} key={mode}>
          {mode === 'invoice-history-restore' && <>
            <label htmlFor="history-backup-file">Encrypted request-history backup</label>
            <input id="history-backup-file" name="historyBackup" type="file" accept="application/json,.json" required disabled={busy}/>
            <p className="hint">Restore your wallet first, then choose its separate history backup. Missing requests will be added; current records are kept. Maximum 256 KB.</p>
          </>}
          {mode === 'invoice-history-export' && <p className="hint">This creates an encrypted copy of saved requests. Keep it alongside your wallet recovery backup; restoring history requires the same Honeybee account and recovered wallet.</p>}
          {mode === 'invoice-create' && <>
            <label htmlFor="request-amount">Amount to request in test USDC</label>
            <input id="request-amount" name="amount" type="text" inputMode="decimal" defaultValue="1.00" maxLength={16} required disabled={busy}/>
            <label htmlFor="request-lifetime">Request expires in</label>
            <select id="request-lifetime" name="lifetime" defaultValue="3600" disabled={busy}><option value="900">15 minutes</option><option value="3600">1 hour</option><option value="86400">24 hours</option></select>
            <p className="hint">Maximum 10 test USDC. The request uses this account’s private receiving address.</p>
          </>}
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
          <p>{(quoteCurrent ? quote.stage === 'approval' : review.approvalRequired) ? `A separate approval for exactly ${formatUnits(BigInt(review.amountUnits), 6)} test USDC would be needed.` : 'An existing allowance covers this amount at the checked block.'}</p>
          {quoteCurrent ? <>
            <p>Estimated maximum network fee for {quote.stage === 'approval' ? 'approval' : 'the deposit'}: <strong>{formatUnits(BigInt(quote.maxNetworkFeeWei), 18)} Sepolia ETH</strong></p>
            <p>{quote.stage === 'approval' ? 'This covers approval only. The deposit needs a separate fee check after approval confirms.' : 'The exact deposit was simulated successfully. This does not mean it has been submitted or confirmed.'}</p>
            <p>Next wallet step: {confirmationStep === 'switch-network' ? 'switch to Sepolia' : quote.stage === 'approval' ? 'confirm the exact USDC approval' : 'confirm the deposit'}.</p>
            <p>Fee check expires at {new Date(quote.expiresAt).toLocaleTimeString()}. The actual network fee may be lower.</p>
          </> : <p>{quote ? 'The network fee check expired.' : 'Network fee: not checked yet.'} Check it before proceeding to wallet confirmation.</p>}
          {runtime?.shieldPreflightEnabled && <button type="button" className="secondary" disabled={busy} onClick={() => perform('shield-preflight')}>{busy ? 'Checking…' : quoteCurrent ? 'Refresh network fee' : 'Check network fee'}</button>}
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
      {runtime?.privateRequestsEnabled && <PrivatePaymentRequests key={accountId} created={result?.paymentRequest} history={result?.requestHistory} encryptedHistory={result?.encryptedRequestHistory}
        wallet={result?.privateWallet} checkPayment={runtime?.privatePaymentCheckEnabled ? checkPayment : null} busy={busy}
        onCloseHistory={() => setResult(previous => previous ? { ...previous, requestHistory: null, paymentRequest: null, encryptedRequestHistory: null } : previous)} isCurrent={() => alive.current && latest.current?.authenticated && latest.current.userId === accountId}/>}
      {download && <div className="notice protected"><strong>Your encrypted recovery copy is ready.</strong><p>Save it somewhere you can access if this device is lost. Then use “Verify saved backup” to check your saved file.</p><button className="secondary" onClick={saveBackup} disabled={busy}>Download encrypted backup</button></div>}
      <DepositActivity key={accountId} connection={connection} accountId={accountId}/>
    </>}
    {message && <p className="status" role="status">{message}</p>}
    <p className="kyc-note">Identity verification is deferred for this testnet demo. Signing in does not mean your identity has been verified.</p>
    <div className="card-bottom"><span>Wallet setup only</span><span>Private payments coming next</span></div>
  </section>;
}
