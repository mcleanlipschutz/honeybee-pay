import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createAccountWalletClient, isLocalDemo, readRecoveryFile } from './account-client.mjs';
import { createHistoryBackupReader } from '../../shared/request-history-backup.mjs';
import { formatUnits } from 'viem';
import { shieldAmountUnits, assetForToken } from './shield-review.mjs';
import { PrivatePaymentRequests } from './PrivatePaymentRequests.jsx';
import { privateRequestAmount } from './private-request.mjs';
import { shieldConfirmationStep } from './shield-preflight.mjs';
import { DepositActivity } from './DepositActivity.jsx';
import { ShieldConfirmation } from './ShieldConfirmation.jsx';
import { PrivatePaymentActivity } from './PrivatePaymentActivity.jsx';

const actionNames = { create: 'Create private wallet', restore: 'Restore my wallet',
  unlock: 'Check my wallet', backup: 'Prepare recovery download', 'verify-backup': 'Verify saved backup', sync: 'Sync private balance', 'shield-review': 'Review test deposit', 'invoice-create': 'Create payment request', 'invoice-history': 'Open request history', 'invoice-history-export': 'Back up request history', 'invoice-history-restore': 'Restore request history', 'invoice-receipts': 'Check received private payments' };
const sections = [['wallet', 'Wallet'], ['pay', 'Pay a request'], ['request', 'Request payment'], ['recovery', 'Recovery']];
const sectionCopy = {
  wallet: ['Your private wallet', 'Check your wallet or refresh its private test USDC balance.'],
  pay: ['Review a merchant request', 'Open a request file to review its amount and receiving address.'],
  request: ['Request a payment', 'Create a request for a buyer, or reopen one you saved.'],
  recovery: ['Backups & recovery', 'Keep your wallet backup and request-history backup together, with the password stored separately.'],
};

export function PrivateWalletPanel({ connection, runtime }) {
  const accountId = connection?.ready && connection?.authenticated ? connection.userId : null;
  const latest = useRef(connection); latest.current = connection;
  const alive = useRef(true), controller = useRef(null), inFlight = useRef(false);
  const formRef = useRef(null);
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('create'), [message, setMessage] = useState('');
  const [depositAssetId, setDepositAssetId] = useState('usdc');
  const [section, setSection] = useState('wallet');
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
    setResult(previous => previous ? { ...previous, shieldReview: savedReview, shieldPreflight: null, paymentRequest: null, requestHistory: null, encryptedRequestHistory: null, receivedPrivatePayments: null } : previous);
    if (action === 'sync') {
      setResult(previous => previous ? { ...previous, synchronization: null, spendableBalance: null, spendableBalanceVerified: false } : previous);
      setMessage('Checking private wallet history and spendable test USDC. The first scan can take up to five minutes. Keep this page open.');
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
      setMode(next.privateWallet.status === 'not-created' ? 'create' : null);
      if (action === 'create') setSection('recovery');
      if (next.encryptedBackup) setDownload(next.encryptedBackup);
      if (action === 'verify-backup') setDownload('');
      if (action === 'create') setMessage('Wallet created. Download your encrypted backup and keep its password separately.');
      else if (action === 'invoice-create') setMessage('Payment request saved to this account’s encrypted local history. Your wallet is locked again.');
      else if (action === 'invoice-history-export') setMessage('Encrypted history backup ready. Keep it with your wallet recovery backup.');
      else if (action === 'invoice-history-restore') setMessage(`${next.historyRestoration.added} requests restored; ${next.historyRestoration.alreadySaved} already saved. ${next.historyRestoration.total} requests in this account’s history.`);
      else if (action === 'invoice-history') setMessage('Request history opened. Payment status has not been checked; these are not receipts.');
      else if (action === 'invoice-receipts') setMessage(`${next.receivedPrivatePayments.length} confirmed private payments matched saved requests. Your wallet is locked again.`);
      else if (action === 'restore') setMessage('Your private wallet was restored for this account.');
      else if (action === 'verify-backup') setMessage('Recovery copy verified. It opens the wallet saved for this account.');
      else if (action === 'unlock') setMessage('Wallet and recovery password checked. The wallet is now locked again.');
      else if (action === 'sync') setMessage('Private wallet history checked. The balance below is a snapshot; the wallet is locked again.');
      else if (action === 'shield-review') setMessage('Deposit review prepared. Your wallet is locked again. No funds were moved.');
      else if (action === 'shield-preflight') setMessage('Fee check completed. Review the fee and use the next wallet step while its countdown is active. No funds were moved.');
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
  const transact = async (action, fields, wallet, quote) => {
    if (!client || inFlight.current) throw new Error('Wait for the current wallet operation to finish.');
    inFlight.current = true; setBusy(true);
    try { return await client.privatePayment(action, fields, wallet, quote); }
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
        fields.assetId = values.get('assetId');
        shieldAmountUnits(fields.amount, fields.assetId);
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
  const reviewAsset = review ? assetForToken(review.token) : null;
  const quote = result?.shieldPreflight;
  const quoteCurrent = quote && clock < quote.expiresAt;
  const confirmationStep = shieldConfirmationStep({ review, quote, publicAddress: connection?.wallet?.address,
    chainId: connection?.wallet?.chainId, now: clock });
  const reviewCurrent = review && clock < review.expiresAt
    && connection?.wallet?.address?.toLowerCase() === review.publicAddress.toLowerCase();
  const chooseAction = action => {
    if (inFlight.current) return;
    historyReader.clear(); formRef.current?.reset(); setMode(action); setMessage('');
    setResult(previous => previous ? { ...previous, shieldReview: null, shieldPreflight: null,
      paymentRequest: null, requestHistory: null, encryptedRequestHistory: null } : previous);
  };
  const chooseSection = next => { if (!inFlight.current) { chooseAction(null); setSection(next); } };
  const actions = !existing ? ['create', 'restore']
    : section === 'wallet' ? ['unlock', ...(runtime?.accountSyncEnabled ? ['sync'] : [])]
    : section === 'request' ? ['invoice-create', 'invoice-history', ...(runtime?.privateTransferEnabled ? ['invoice-receipts'] : [])]
    : section === 'recovery' ? ['backup', 'verify-backup', ...(runtime?.privateRequestsEnabled ? ['invoice-history-export', 'invoice-history-restore'] : [])]
    : [];
  return <section className="checkout wallet-panel" aria-labelledby="wallet-heading">
    <div className="card-top"><span className="eyebrow">YOUR HONEYBEE WALLET</span><span className="pill">Local · Sepolia testnet</span></div>
    <h2 id="wallet-heading">{existing ? 'What would you like to do?' : 'Your wallet starts here.'}</h2>
    <p className="subtext">{existing ? 'Choose one task below. Your wallet stays locked between actions.' : 'Sign in to create a private test wallet or recover one from a backup.'}</p>
    <div className="wallet-row"><div><span className="label">HONEYBEE ACCOUNT</span><strong>{accountId ? connection.email || 'Signed in' : 'Sign in with email'}</strong></div>
      <button className="secondary" disabled={!connection?.ready || busy} onClick={() => accountId ? connection.logout() : connection.login()}>{accountId ? 'Sign out' : 'Create account / sign in'}</button></div>
    {!connection && <p className="notice">Sign-in is available after the local demo has its Privy app configuration.</p>}
    {!supported && <p className="notice">Private wallet setup is available in the local testnet demo. This preview cannot create a private wallet.</p>}
    {accountId && supported && <>
      <div className="wallet-toolbar"><strong>{busy ? 'Working…' : !result ? message ? 'Wallet status unavailable' : 'Checking wallet status' : existing ? 'Private wallet saved' : 'Create or restore your wallet'}</strong><button className="text-button" disabled={busy} onClick={() => perform('status')}>Refresh status</button></div>
      {existing && <nav className="wallet-sections" aria-label="Private wallet tasks">
        {sections.filter(([id]) => runtime?.privateRequestsEnabled || !['pay', 'request'].includes(id)).map(([id, label]) =>
          <button type="button" key={id} aria-pressed={section === id} disabled={busy} onClick={() => chooseSection(id)}>{label}</button>)}
      </nav>}
      {existing && <div className="task-heading"><h3>{sectionCopy[section][0]}</h3><p>{sectionCopy[section][1]}</p></div>}
      {message && <p className="status" role="status">{message}</p>}
      {existing && section === 'wallet' && <details className="wallet-details"><summary>Private wallet address</summary>
        {result.privateWallet.privateAddress ? <><code>{result.privateWallet.privateAddress}</code><p>This is a private receiving address. Use your public wallet address for test funding.</p></>
          : <p>Choose “Check my wallet” and enter its recovery password to display the address.</p>}
      </details>}
      {result && <>
        {!!actions.length && <div className="wallet-actions" role="group" aria-label="Actions for this task">
          {actions.filter(action => action !== mode).map(action => <button key={action} type="button" className="secondary" disabled={busy} onClick={() => chooseAction(action)}>{actionNames[action]}</button>)}
        </div>}
        {mode && <form className="wallet-task-form" ref={formRef} onSubmit={submit} key={mode}>
          <div className="task-form-heading"><h4>{actionNames[mode]}</h4>{existing && <button type="button" className="text-button" disabled={busy} onClick={() => chooseAction(null)}>Cancel</button>}</div>
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
            <label htmlFor="shield-asset">What are you funding?</label>
            <select id="shield-asset" name="assetId" value={depositAssetId} onChange={e => setDepositAssetId(e.target.value)} disabled={busy}>
              <option value="usdc">Merchant payments · test USDC</option><option value="fee-weth">Private payment fees · Sepolia WETH</option>
            </select>
            <label htmlFor="shield-amount">Amount to move into your private wallet</label>
            <input key={depositAssetId} id="shield-amount" name="amount" type="text" inputMode="decimal" defaultValue={depositAssetId === 'usdc' ? '2.00' : '0.005'} maxLength={32} required disabled={busy}/>
            <p className="hint">{depositAssetId === 'usdc' ? 'Maximum 10 test USDC.' : 'Maximum 0.01 Sepolia WETH. If needed, first wrap Sepolia ETH in your public wallet, then approve and deposit WETH. Each step needs your confirmation.'} Test assets only. This prepares a review.</p>
          </>}
          {['restore', 'verify-backup'].includes(mode) && <><label htmlFor="recovery-file">Encrypted Honeybee backup</label><input id="recovery-file" name="backup" type="file" accept="application/json,.json" required disabled={busy}/></>}
          <label htmlFor="recovery-password">{mode === 'create' ? 'Choose a recovery password' : 'Recovery password'}</label>
          <input id="recovery-password" name="password" type="password" minLength={16} maxLength={256} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} required disabled={busy}/>
          {mode === 'create' && <><label htmlFor="repeat-password">Repeat recovery password</label><input id="repeat-password" name="repeat" type="password" minLength={16} maxLength={256} autoComplete="new-password" required disabled={busy}/></>}
          <p className="hint">{mode === 'create' ? 'Use at least 16 characters. Recovery needs this account, your backup file and its password.' : 'Enter the recovery password for this wallet. It clears when you submit.'}</p>
          <button className="primary" disabled={busy || uncertain}>{busy ? 'Working…' : actionNames[mode]}</button>
        </form>}
      </>}
      {section === 'wallet' && result?.spendableBalanceVerified && result.spendableBalance && <div className="notice">
        <strong>{formatUnits(BigInt(result.spendableBalance.amountUnits), 6)} test USDC available privately</strong>
        {result.spendableFeeBalance && <p>{formatUnits(BigInt(result.spendableFeeBalance.amountUnits), 18)} Sepolia WETH available privately for fees</p>}
        <p>Checked {new Date(result.synchronization.checkedAt).toLocaleString()}. This is a snapshot of spendable private funds, separate from your public wallet balance.</p>
        <p>{result.spendableBalance.amountUnits === '0' ? 'No spendable test USDC was found. Private funding is the next step.' : 'Open Pay a request to review a merchant payment and its broadcaster fee.'}</p>
      </div>}
      {review && <div className="notice" aria-label="Test deposit review">
        <strong>{reviewCurrent ? 'Review your test deposit' : 'This deposit review has expired or your funding wallet changed.'}</strong>
        {reviewCurrent ? <>
          <p>Token: {reviewAsset.label}</p>
          <p>From your public wallet: {formatUnits(BigInt(review.amountUnits), reviewAsset.decimals)} {reviewAsset.label}</p>
          <p>Protocol fee: {formatUnits(BigInt(review.feeUnits), reviewAsset.decimals)} {reviewAsset.label}</p>
          <p>Expected in your private wallet: {formatUnits(BigInt(review.receivedUnits), reviewAsset.decimals)} {reviewAsset.label}</p>
          <p>{(quoteCurrent ? BigInt(quote.allowanceUnits) < BigInt(review.amountUnits) : review.approvalRequired) ? `A separate approval for exactly ${formatUnits(BigInt(review.amountUnits), reviewAsset.decimals)} ${reviewAsset.label} would be needed.` : 'An existing allowance covers this amount at the checked block.'}</p>
          {quoteCurrent ? <>
            <p>Estimated maximum network fee for {quote.stage === 'wrap' ? 'wrapping Sepolia ETH' : quote.stage === 'approval' ? 'approval' : 'the deposit'}: <strong>{formatUnits(BigInt(quote.maxNetworkFeeWei), 18)} Sepolia ETH</strong></p>
            <p>{quote.stage === 'wrap' ? 'Wrapping creates WETH in your public wallet. Approval and private deposit are separate steps.' : quote.stage === 'approval' ? 'This covers approval only. The deposit needs a separate fee check after approval confirms.' : 'The exact deposit was simulated successfully. This does not mean it has been submitted or confirmed.'}</p>
            <p>Next wallet step: {confirmationStep === 'switch-network' ? 'switch to Sepolia' : quote.stage === 'wrap' ? 'confirm wrapping Sepolia ETH' : quote.stage === 'approval' ? 'confirm the exact token approval' : 'confirm the deposit'}.</p>
            <p><strong>Fee check valid for {Math.max(0, Math.ceil((quote.expiresAt - clock) / 1000))} more seconds.</strong> The final recheck must finish before expiry; a slow connection may require refreshing. The actual network fee may be lower.</p>
          </> : <p>{quote ? 'The network fee check expired. Refresh it to start a new wallet step. An original transaction already requested can still be checked below or in Deposit activity.' : 'Network fee: not checked yet. Check it before proceeding to wallet confirmation.'}</p>}
          {runtime?.shieldPreflightEnabled && <button type="button" className="secondary" disabled={busy} onClick={() => perform('shield-preflight')}>{busy ? 'Checking…' : quoteCurrent ? 'Refresh network fee' : 'Check network fee'}</button>}
        </> : <p>Choose “Review test deposit” again to check fresh terms.</p>}
        {runtime?.shieldSubmissionEnabled && quote && <ShieldConfirmation key={quote.quoteId}
          review={review} quote={quote} client={client} connection={connection} accountId={accountId} disabled={busy}
          canConfirm={reviewCurrent && quoteCurrent}
          onBusyChange={value => { inFlight.current = value; setBusy(value); }}
          needsNetworkSwitch={confirmationStep === 'switch-network'}
          isCurrent={() => alive.current && latest.current?.authenticated && latest.current.userId === accountId}/>}
        {reviewCurrent && <>
          <details className="wallet-details"><summary>Funding wallet and destination</summary>
            <p>Public funding wallet</p><code>{review.publicAddress}</code>
            <button type="button" className="text-button" onClick={() => copyAddress(review.publicAddress)}>Copy funding address</button>
            <a href={`https://sepolia.etherscan.io/address/${review.publicAddress}`} target="_blank" rel="noopener noreferrer">View public wallet on Sepolia</a>
            <p>Your private wallet</p><code>{review.privateAddress}</code>
            <button type="button" className="text-button" onClick={() => copyAddress(review.privateAddress)}>Copy private address</button>
          </details>
          <p>A shield deposit exposes the public funding wallet, token, amount and timing. Funds become spendable privately only after confirmation and a successful wallet scan.</p>
          <p>Approval and deposit each require your wallet confirmation. Keep this page open and verify each original transaction before continuing.</p>
        </>}
      </div>}
      {runtime?.privateRequestsEnabled && existing && ['pay', 'request', 'recovery'].includes(section) && <PrivatePaymentRequests key={`${accountId}:${section}`} view={section} created={result?.paymentRequest} history={result?.requestHistory} encryptedHistory={result?.encryptedRequestHistory}
        wallet={result?.privateWallet} checkPayment={runtime?.privatePaymentCheckEnabled ? checkPayment : null}
        transact={runtime?.privateTransferEnabled ? transact : null} busy={busy}
        onCloseHistory={() => setResult(previous => previous ? { ...previous, requestHistory: null, paymentRequest: null, encryptedRequestHistory: null } : previous)} isCurrent={() => alive.current && latest.current?.authenticated && latest.current.userId === accountId}/>}
      {section === 'request' && result?.receivedPrivatePayments && <div className="notice" role="status">
        <h4>Received private payments</h4>
        {result.receivedPrivatePayments.length === 0 && <p>No confirmed, POI-validated private payment matched a saved request. A recent payment may still need confirmation and wallet synchronization.</p>}
        {result.receivedPrivatePayments.map(item => <div key={`${item.requestId}:${item.receipt.hash}`}>
          <p><strong>Received {formatUnits(BigInt(item.amountUnits), 6)} test USDC privately</strong></p>
          <p>Request: {item.requestId}</p>
          <p>The receiving note was decrypted by this wallet, its request reference matched, and the Sepolia transaction was confirmed.</p>
          <a href={`https://sepolia.etherscan.io/tx/${item.receipt.hash}`} target="_blank" rel="noopener noreferrer">View private transaction</a>
          {item.receipt.requestExpiredAtSettlement && <p>Received after the request expired. Review acceptance with the buyer.</p>}
        </div>)}
      </div>}
      {download && section === 'recovery' && <div className="notice protected"><strong>Your encrypted recovery copy is ready.</strong><p>Save it, then choose “Verify saved backup” to check the downloaded file.</p><button className="secondary" onClick={saveBackup} disabled={busy}>Download encrypted backup</button></div>}
      {existing && section === 'wallet' && <details className="wallet-tools"><summary>Test deposit tools</summary>
        <p>Review a small test deposit, confirm it in your wallet, or check a saved attempt.</p>
        {runtime?.shieldReviewEnabled && <button type="button" className="secondary" disabled={busy} onClick={() => chooseAction('shield-review')}>Review test deposit</button>}
        <DepositActivity key={accountId} connection={connection} accountId={accountId}/>
      </details>}
      {runtime?.privateTransferEnabled && result?.privateWallet?.id && ['wallet', 'pay'].includes(section) && <PrivatePaymentActivity
        key={accountId} wallet={result.privateWallet} transact={transact} disabled={busy}
        isCurrent={() => alive.current && latest.current?.authenticated && latest.current.userId === accountId}/>}
    </>}
    <p className="wallet-test-note">Experimental local testnet build. Test wallets and test assets only.</p>
    <details className="wallet-tools"><summary>About this local demo</summary><p>This computer handles wallet keys and recovery passwords. Email sign-in alone cannot recover a wallet.</p><p>Identity verification is deferred. Signing in does not verify a merchant’s identity.</p></details>
  </section>;
}
