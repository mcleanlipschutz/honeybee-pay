import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { paymentChain, PAYMENT_RPC_URL, toWalletTransaction } from './wallet-network.mjs';
import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import { CHAIN_ID } from './payment.mjs';
import { loadWalletBalance, reviewPayment, revalidatePayment, PaymentReviewError } from './automatic-fees.mjs';
import { parsePaymentInput, makeRequest, requestLink, RequestError } from './payment-request.mjs';
import { attemptKey, readAttempt, beginAttempt, saveAttempt, commitAttemptResult, inspectAttempt, isExplicitRejection } from './mobile-attempt.mjs';
import { loadPublicReceiptPage, findPublicReceipts, sortReceipts, ReceiptError } from './receipts.mjs';
import { trackPayment } from './payment-tracking.mjs';
import { startVisibleRefresh } from './visible-refresh.mjs';
import { signInIssue, canReadWalletStorage } from './sign-in-status.mjs';
const rpc = createPublicClient({ chain: paymentChain, transport: http(PAYMENT_RPC_URL, { timeout: 15000, retryCount: 1 }) });
const short = a => `${a.slice(0, 6)}…${a.slice(-4)}`;
const units = amount => formatUnits(BigInt(amount), 6);
function Icon({ name, ...props }) {
  const paths = { wallet: <><path d="M4 6h15v14H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13v2"/><path d="M19 11h-6v5h6M16 13.5h.01"/></>, pay: <><path d="M5 19 19 5M5 5h14v14"/></>, request: <><path d="M19 5 5 19M5 5v14h14"/></>, activity: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, scan: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 12h18"/></>, back: <path d="m14 5-7 7 7 7"/>, check: <path d="m5 12 4 4L19 6"/>, plus: <path d="M12 5v14M5 12h14"/>, close: <path d="m6 6 12 12M6 18 18 6"/> };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
function QR({ value, label }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let active = true; setSrc(''); QRCode.toDataURL(value, { width: 360, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#173d32', light: '#ffffff' } }).then(url => { if (active) setSrc(url); }).catch(() => {}); return () => { active = false; }; }, [value]);
  return <div className="qr-box">{src ? <img src={src} alt={label} width="240" height="240"/> : <p>Preparing QR code…</p>}</div>;
}
function Scanner({ onRead, onClose }) {
  const video = useRef(null); const [error, setError] = useState(''); const done = useRef(false);
  useEffect(() => {
    let live = true;
    const scanner = new QrScanner(video.current, result => { if (!live || done.current) return; done.current = true; scanner.stop(); onRead(result.data); }, { preferredCamera: 'environment', returnDetailedScanResult: true, highlightScanRegion: true });
    scanner.start().catch(() => { if (live) setError('Camera unavailable. Allow camera access or choose a QR image.'); });
    const hidden = () => { if (document.hidden) onClose(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { live = false; scanner.destroy(); document.removeEventListener('visibilitychange', hidden); };
  }, [onRead, onClose]);
  async function file(event) {
    const selected = event.target.files?.[0]; if (!selected || done.current) return;
    if (selected.size > 10 * 1024 * 1024) { setError('Choose an image smaller than 10 MB.'); return; }
    try { const result = await QrScanner.scanImage(selected, { returnDetailedScanResult: true }); done.current = true; onRead(result.data); }
    catch { setError('No readable QR code found. Try a clearer image.'); }
  }
  return <section className="scanner"><div className="section-heading"><h2>Scan to pay</h2><button className="icon-button" onClick={onClose} aria-label="Close scanner"><Icon name="close"/></button></div><div className="camera"><video ref={video} playsInline muted autoPlay/></div><p>Point at a payment QR code.</p>{error && <p className="message" role="alert">{error}</p>}<label className="secondary file-button">Choose QR image<input type="file" accept="image/*" onChange={file}/></label></section>;
}
function Activity({ address, refresh }) {
  const [records, setRecords] = useState([]); const [next, setNext] = useState(undefined); const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [hash, setHash] = useState(''); const control = useRef();
  const load = useCallback(async (beforeBlock, searchHash) => {
    control.current?.abort(); const ac = new AbortController(); control.current = ac; setBusy(true); setError('');
    try {
      if (searchHash) { const found = await findPublicReceipts({ hash: searchHash, wallet: address, signal: ac.signal }); if (!ac.signal.aborted) setRecords(old => sortReceipts([...old, ...found])); }
      else { const result = await loadPublicReceiptPage({ wallet: address, beforeBlock, signal: ac.signal }); if (!ac.signal.aborted) { setRecords(old => beforeBlock === undefined ? result.records : sortReceipts([...old, ...result.records])); setNext(result.nextBlock); } }
    } catch (e) { if (!ac.signal.aborted) setError(e instanceof ReceiptError ? e.message : 'Activity is unavailable. Try again.'); }
    finally { if (!ac.signal.aborted) setBusy(false); }
  }, [address]);
  useEffect(() => { void load(); return () => control.current?.abort(); }, [load, refresh]);
  return <><div className="section-heading"><h1>Activity</h1><button className="text-button" disabled={busy} onClick={() => load()}>Refresh</button></div><p className="muted">Money sent and received.</p>{busy && !records.length ? <p className="empty" role="status">Loading your payments…</p> : !records.length && !error ? <div className="empty"><Icon name="activity"/><h2>A fresh start.</h2><p>Your recent payments will appear here.</p></div> : null}<div className="activity-list">{records.map(r => <a className="activity-row" key={r.id} href={`https://sepolia.etherscan.io/tx/${r.transactionHash}`} target="_blank" rel="noreferrer"><span className={`activity-icon ${r.direction}`}><Icon name={r.direction === 'received' ? 'request' : 'pay'}/></span><span className="activity-description"><strong>{r.direction === 'received' ? 'Received' : r.direction === 'self' ? 'Moved' : 'Sent'}</strong><small>{short(r.direction === 'received' ? r.sender : r.recipient)} · {new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span><span className="activity-amount">{r.direction === 'received' ? '+' : '−'}{units(r.amountUnits)}<small>USDC · Confirmed ↗</small></span></a>)}</div>{error && <p className="message" role="alert">{error}</p>}{next !== null && next !== undefined && <button className="secondary" disabled={busy} onClick={() => load(next)}>{busy ? 'Loading…' : 'Load earlier payments'}</button>}<details className="quiet-details"><summary>Find an older payment</summary><form onSubmit={e => { e.preventDefault(); void load(undefined, hash.trim()); }}><label htmlFor="activity-hash">Transaction reference</label><input id="activity-hash" value={hash} onChange={e=>setHash(e.target.value)} autoCapitalize="none" autoComplete="off" spellCheck="false" placeholder="0x…" required/><button className="secondary" disabled={busy}>Find payment</button></form></details></>;
}
export function MobileWallet({ connection, local = false }) {
  const [view, setView] = useState(location.hash.startsWith('#pay=') ? 'pay' : 'wallet');
  const [balance, setBalance] = useState(null); const [balanceError, setBalanceError] = useState(false); const [refresh, setRefresh] = useState(0);
  const [input, setInput] = useState(location.hash.startsWith('#pay=') ? location.href : ''); const [amount, setAmount] = useState('');
  const [review, setReview] = useState(null); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [scanning, setScanning] = useState(false);
  const [requestAmount, setRequestAmount] = useState(''); const [request, setRequest] = useState(null); const [requestUrl, setRequestUrl] = useState(''); const [attempt, setAttempt] = useState(null); const [storageError, setStorageError] = useState(''); const [recoveryHash, setRecoveryHash] = useState(''); const [account, setAccount] = useState(false);
  const operation = useRef(false); const current = useRef(connection); current.current = connection;
  useEffect(() => () => { current.current = null; }, []);
  const address = connection?.wallet?.address;
  const active = connection?.authenticated && connection?.walletsReady && address;
  const pending = attempt?.status === 'pending';
  const waitingForConnection = !!connection && (!connection.ready || (connection.authenticated && !active));
  const [connectionSlow, setConnectionSlow] = useState(false);
  const [storageAvailable] = useState(canReadWalletStorage);
  const signInProblem = signInIssue({ error: connection?.error, slow: connectionSlow, ready: !!connection?.ready, authenticated: !!connection?.authenticated, walletReady: !!active, secure: globalThis.isSecureContext !== false, storageAvailable });
  useEffect(() => {
    setConnectionSlow(false);
    if (!waitingForConnection) return;
    const timer = setTimeout(() => setConnectionSlow(true), 20000);
    return () => clearTimeout(timer);
  }, [waitingForConnection, connection?.authenticated]);
  useEffect(() => {
    const hash = () => { if (location.hash.startsWith('#pay=')) { setInput(location.href); setAmount(''); setReview(null); setView('pay'); setMessage(''); } };
    window.addEventListener('hashchange', hash); return () => window.removeEventListener('hashchange', hash);
  }, []);
  useEffect(() => {
    if (!active) return;
    return startVisibleRefresh(async signal => {
      try {
        const data = await loadWalletBalance(rpc, address);
        if (!signal.aborted) { setBalance(data); setBalanceError(false); }
      } catch {
        if (!signal.aborted) { setBalance(null); setBalanceError(true); }
      }
    });
  }, [active, address, refresh]);
  useEffect(() => {
    if (!address) return;
    const read = () => { try { setAttempt(readAttempt(localStorage, address)); setStorageError(''); } catch { setStorageError('Payment recovery storage is unavailable. Use a regular browser with storage enabled.'); } };
    read(); const changed = e => { if (e.key === attemptKey(address)) read(); };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, [address]);
  const closeScanner = useCallback(() => setScanning(false), []);
  const scanned = useCallback(text => { setScanning(false); setReview(null); try { const parsed = parsePaymentInput(text); setInput(text); setAmount(parsed.amount); setMessage(''); } catch(e) { setMessage(e instanceof RequestError ? e.message : 'This QR code is not a supported payment request.'); } }, []);
  const go = next => { if (operation.current) return; setView(next); setScanning(false); setMessage(''); setAccount(false); setReview(null); };
  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); setMessage(`${label} copied.`); } catch { setMessage('Press and hold the address or link to copy it.'); } };
  useEffect(() => { if (!request) return; const timer = setTimeout(() => { setRequest(null); setRequestUrl(''); setMessage('This request expired. Create a new one.'); }, Math.max(0, request.expiresAt - Date.now())); return () => clearTimeout(timer); }, [request]);
  const share = async () => { if (!request || Date.now() >= request.expiresAt) { setRequest(null); setMessage('This request expired. Create a new one.'); return; } const url = requestUrl; if (navigator.share) { try { await navigator.share({ title: 'Honeybee Pay request', text: request.amount ? `Request for ${request.amount} test USDC` : 'Send me test USDC with Honeybee Pay', url }); } catch(e) { if (e.name !== 'AbortError') await copy(url, 'Payment link'); } } else await copy(url, 'Payment link'); };
  const reviewNow = async e => {
    e.preventDefault(); if (!active || operation.current) return; operation.current = true; setBusy(true); setMessage('');
    try {
      if (readAttempt(localStorage, address)?.status === 'pending') throw new PaymentReviewError('Check your previous payment before sending again.');
      const parsed = parsePaymentInput(input);
      const value = parsed.amount || amount;
      if (!value) throw new PaymentReviewError('Enter the amount you want to send.');
      const next = await reviewPayment({ rpc, sender: address, recipient: parsed.recipient, amount: value, request: parsed.request });
      if (current.current?.wallet?.address !== address || !current.current.authenticated) return;
      setAmount(value); setReview(next);
    } catch(e) { setMessage(e instanceof RequestError || e instanceof PaymentReviewError ? e.message : 'We could not prepare this payment. Check the recipient, amount and balance, then try again.'); }
    finally { operation.current = false; setBusy(false); }
  };
  const finishCheck = async (record, hash, holdsLock = false) => {
    const result = await inspectAttempt(rpc, record, hash);
    if (!result) return null;
    const apply = () => { const latest = commitAttemptResult(localStorage, address, result); setAttempt(latest); setRefresh(v=>v+1); setMessage(''); return latest; };
    if (holdsLock) return apply();
    if (!navigator.locks) throw new Error('Secure recovery is unavailable in this browser.');
    return navigator.locks.request(attemptKey(address), apply);
  };
  const pay = async () => {
    if (operation.current || !review || pending || storageError) return;
    operation.current = true; setBusy(true); setMessage('Preparing your payment…');
    let started = false; let record;
    try {
      if (!navigator.locks) throw new PaymentReviewError('Use an up-to-date browser to send securely.');
      await navigator.locks.request(attemptKey(address), { ifAvailable: true }, async lock => {
        if (!lock) throw new PaymentReviewError('A payment is open in another tab. Finish it there first.');
        if (readAttempt(localStorage, address)?.status === 'pending') throw new PaymentReviewError('Check your previous payment before sending again.');
        const selected = current.current?.wallet;
        if (!current.current?.authenticated || selected?.address !== address) throw new PaymentReviewError('Sign in again and review your payment.');
        await selected.switchChain(CHAIN_ID);
        const provider = await selected.getEthereumProvider();
        const [chain, accounts] = await Promise.all([provider.request({ method:'eth_chainId' }), provider.request({ method:'eth_accounts' })]);
        if (Number(chain) !== CHAIN_ID || !accounts.some(a=>a.toLowerCase() === address.toLowerCase())) throw new PaymentReviewError('Your wallet changed. Review the payment again.');
        const transaction = await revalidatePayment({ rpc, review, sender: address });
        const [afterBlock, nonce] = await Promise.all([rpc.getBlockNumber(), rpc.getTransactionCount({ address, blockTag:'pending' })]);
        let intentId = null;
        if (!local) { const intent = await trackPayment('/api/payment-intents', { sender: address, recipient: review.approved.recipient, amount: units(review.approved.amountUnits), expiresAt: review.approved.expiresAt }, current.current.getAccessToken); intentId = intent.id; }
        if (!current.current?.authenticated || current.current.wallet?.address !== address || Date.now() >= review.expiresAt) throw new PaymentReviewError('Your total needs updating. Review it once more.');
        record = beginAttempt(localStorage, address, { approved: review.approved, createdAt: Date.now(), afterBlock: afterBlock.toString(), nonce, intentId }); setAttempt(record);
        // Persist uncertainty before invoking the wallet. A rejected promise does not prove a transfer was not sent.
        started = true; setMessage('Sending your payment…');
        const result = await current.current.sendTransaction(toWalletTransaction(transaction, nonce), { address, uiOptions: { showWalletUIs: false } });
        if (!/^0x[0-9a-f]{64}$/i.test(result?.hash || '')) throw new Error('Missing hash');
        record = { ...record, hash: result.hash }; saveAttempt(localStorage, address, record); setAttempt(record);
        if (intentId) void trackPayment('/api/payment-submissions', { id:intentId, hash:result.hash }, connection.getAccessToken).catch(()=>{});
        setMessage('Sent. Waiting for confirmation…');
        await rpc.waitForTransactionReceipt({ hash:result.hash, confirmations:2, timeout:60000 });
        await finishCheck(record, undefined, true);
      });
    } catch(e) {
      if (started && isExplicitRejection(e) && !record?.hash) { try { localStorage.removeItem(attemptKey(address)); setAttempt(null); setMessage('Payment cancelled. Nothing was sent.'); } catch { setMessage('Check your payment status before trying again.'); } }
      else if (started) setMessage('Your payment is still being checked. Keep this browser’s data and check its status before sending again.');
      else setMessage(e instanceof PaymentReviewError ? e.message : 'We could not start your payment. Review the details and try again.');
    } finally { operation.current = false; setBusy(false); }
  };
  const recheck = async () => {
    if (operation.current) return; operation.current = true; setBusy(true); setMessage('Checking your payment…');
    try {
      const result = await finishCheck(attempt, recoveryHash.trim() || undefined);
      if (!result) setMessage('We haven’t found confirmation yet. Please don’t send this payment again while we check.');
    }
    catch { setMessage('Payment status is unavailable right now. We haven’t confirmed whether it went through. Try checking again shortly.'); }
    finally { operation.current = false; setBusy(false); }
  };
  useEffect(() => {
    // Reconcile only the existing attempt. Nothing in this loop can sign or resend.
    if (!active || !pending) return;
    return startVisibleRefresh(async signal => {
      if (operation.current) return;
      const saved = readAttempt(localStorage, address);
      if (!saved || saved.id !== attempt.id || saved.status !== 'pending') return false;
      const result = await inspectAttempt(rpc, saved);
      if (!result || signal.aborted || !navigator.locks) return;
      return navigator.locks.request(attemptKey(address), { ifAvailable: true }, lock => {
        if (!lock || signal.aborted) return;
        const latest = commitAttemptResult(localStorage, address, result);
        setAttempt(latest);
        setRefresh(v=>v+1);
        if (latest?.id === saved.id && latest.status !== 'pending') setMessage('');
        return false;
      });
    }, { interval: 12000 });
  }, [active, address, pending, attempt?.id, attempt?.hash]);
  let parsedInput;
  try { if (input) parsedInput = parsePaymentInput(input); } catch {}
  const fixedAmount = !!parsedInput?.amount;
  const signedOut = !connection?.authenticated;
  return <div className="mobile-shell"><header className="app-header"><a className="brand" href="/" aria-label="Honeybee Pay home"><img src="/assets/honeybee-mascot.png" alt="" width="40" height="40"/><span>honeybee<span className="brand-pay">pay</span></span></a>{active && <button className="avatar" aria-label="Your account" disabled={busy} onClick={()=>{setAccount(v=>!v);setMessage('');}}>{connection.email?.[0]?.toUpperCase() || 'H'}</button>}</header><main className="mobile-main"><div className="test-label"><span/>Test mode · No real money</div>
    {signedOut ? <section className="welcome"><div className="welcome-bee"><img src="/assets/honeybee-mascot.png" alt="Honeybee" width="160" height="160"/></div><p className="eyebrow">YOUR EVERYDAY WALLET</p><h1 aria-describedby="privacy-goal-note">A simpler,<br/>more private<br/>way to pay.<sup>*</sup></h1><p>Send money, receive funds, or scan a code to pay with zero-knowledge privacy built in.<sup>*</sup> One wallet for everyday payments, with your financial details kept private.<sup>*</sup></p><p className="privacy-note" id="privacy-goal-note">*Our goal for the finished product. Zero-knowledge privacy is still in development; payments in the current test version are public.</p><button className="primary" disabled={!connection?.ready && !signInProblem} onClick={()=>signInProblem && !connection?.ready ? location.reload() : connection?.login()}>{!connection ? 'Sign-in is being set up' : connection.ready ? 'Continue with email' : signInProblem ? 'Try connecting again' : 'Getting ready…'}<Icon name="pay"/></button>{signInProblem && <p className="message" role="alert">{signInProblem.message}<br/><small>Support code: {signInProblem.code}</small></p>}<small>Try sending and receiving test USDC.<br/>These test payments are public.</small></section>
    : !active ? <section className="empty" aria-live="polite"><h1>{signInProblem ? 'Let’s reconnect.' : 'Opening your wallet…'}</h1><p>{signInProblem ? signInProblem.message : 'This may take a moment the first time.'}</p>{signInProblem && <><p className="muted">Support code: {signInProblem.code}</p><button className="primary" onClick={()=>location.reload()}>Try connecting again</button></>}<button className="text-button" onClick={()=>connection.logout()}>Sign out</button></section>
    : account ? <section><h1>Your account</h1><p className="muted break-all">{connection.email}</p><div className="card"><label>Your wallet</label><code className="address">{address}</code><button className="secondary" onClick={()=>copy(address,'Wallet address')}>Copy address</button></div><p className="muted">Public test payments on Sepolia.</p><details className="quiet-details"><summary>Wallet backup</summary><p>Keep a private backup so you can use your wallet elsewhere. Only you should view or save it.</p><button className="secondary" onClick={()=>connection.exportWallet({address}).catch(()=>setMessage('Wallet backup could not open. Sign in again and try.'))}>Open secure backup</button></details><button className="secondary" onClick={()=>{setAccount(false);void connection.logout();}}>Sign out</button><button className="text-button" onClick={()=>setAccount(false)}>Back to wallet</button></section>
    : view === 'wallet' ? <section><div className="section-heading"><h1>Your wallet</h1><button className="text-button" onClick={()=>setRefresh(v=>v+1)}>Refresh</button></div><div className="balance-card"><span>Available balance</span><div className="balance-number">{balance ? units(balance.balance) : '—'}<small>USDC</small></div><span className="balance-note">Test funds</span><div className="wallet-actions"><button onClick={()=>go('pay')}><Icon name="pay"/>Pay</button><button onClick={()=>go('add')}><Icon name="plus"/>Add money</button></div></div>{balanceError && <p className="message" role="alert">Your balance is unavailable. Refresh to try again.</p>}{pending && <button className="pending-card" onClick={()=>go('pay')}><Icon name="activity"/><span><strong>Checking your payment</strong><small>View status before sending again</small></span><span>→</span></button>}<div className="wallet-note"><span className="honey-dot"><Icon name="check"/></span><div><h2>Ready when you are.</h2><p>Send money, receive funds,<br/>or scan a code to pay.</p></div></div><button className="list-link" onClick={()=>go('activity')}><span>Recent activity</span><span>→</span></button><p className="muted">Your confirmed payments are one tap away.</p></section>
    : view === 'add' ? <section><button className="back-button" onClick={()=>go('wallet')}><Icon name="back"/>Wallet</button><h1>Add money</h1><p className="muted">Receive test USDC into your wallet.</p><QR value={address} label="Wallet address QR code. Receive only Sepolia test USDC at this address."/><p className="center"><strong>USDC on Sepolia only</strong></p><code className="address center">{address}</code><button className="primary" onClick={()=>copy(address,'Wallet address')}>Copy wallet address</button><p className="muted center">Share this address with the sender.<br/>Your balance updates automatically.</p><details className="quiet-details"><summary>Need free test funds?</summary><p>For this test version, get test USDC and a little test ETH for automatic network fees. They have no monetary value.</p><a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC ↗</a><p><a href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noreferrer">Get test ETH ↗</a></p></details></section>
    : view === 'request' ? <section><h1>Request money</h1><p className="muted">A code to scan. A link to share.</p>{!request ? <form onSubmit={e=>{e.preventDefault();try{const next = makeRequest({recipient:address,amount:requestAmount});setRequestUrl(requestLink(next));setRequest(next);setMessage('');}catch(err){setMessage(err instanceof RequestError?err.message:'Enter a valid amount.');}}}><label htmlFor="request-amount">Amount <span className="optional">optional</span></label><div className="amount-field"><input id="request-amount" inputMode="decimal" placeholder="0.00" value={requestAmount} onChange={e=>setRequestAmount(e.target.value)}/><span>USDC</span></div><p className="hint">Leave blank to let the sender choose. Test limit: 10 USDC.</p><button className="primary">Create request<Icon name="request"/></button></form> : <><QR value={requestUrl} label="Honeybee payment request QR code"/><div className="request-total">{request.amount || 'Any amount'}{request.amount && <small>USDC</small>}</div><p className="muted center">To {short(address)} · Expires in 24 hours</p><button className="primary" onClick={share}>Share request<Icon name="pay"/></button><button className="text-button" onClick={()=>{setRequest(null);setMessage('');}}>Change request</button><details className="quiet-details"><summary>Copy link manually</summary><p className="address">{requestUrl}</p></details><p className="hint">The payer reviews the recipient and total. A request does not move money or confirm payment.</p></>}</section>
    : view === 'activity' ? <Activity address={address} refresh={refresh}/>
    : <section>{scanning ? <Scanner onRead={scanned} onClose={closeScanner}/> : pending || (attempt && view === 'pay' && ['confirmed','failed'].includes(attempt.status)) ? <><div className={`payment-result ${attempt.status}`}><span className="result-icon"><Icon name={pending?'activity':attempt.status==='confirmed'?'check':'close'} width="36" height="36"/></span><h1>{pending?'Checking your payment':attempt.status==='confirmed'?'Payment sent.':'Payment didn’t go through.'}</h1><div className="request-total">{units(attempt.approved.amountUnits)}<small>USDC</small></div><p className="muted">To {short(attempt.approved.recipient)}</p></div>{pending ? <><p className="muted">We’re checking automatically. You can leave this screen; we’ll keep your payment status here.</p><button className="primary" disabled={busy} onClick={recheck}>{busy?'Checking…':'Check status'}</button>{!attempt.hash && <details className="quiet-details"><summary>Have a transaction reference?</summary><label htmlFor="recovery-hash">Transaction reference</label><input id="recovery-hash" value={recoveryHash} onChange={e=>setRecoveryHash(e.target.value)} placeholder="0x…" autoCapitalize="none" spellCheck="false"/></details>}</> : <><button className="primary" onClick={()=>{setAttempt(null);setReview(null);setInput('');setAmount('');setMessage('');history.replaceState(null,'',location.pathname);}}>New payment<Icon name="pay"/></button><button className="text-button" onClick={()=>go('activity')}>View activity</button></>}{attempt.hash && <a className="explorer-link" href={`https://sepolia.etherscan.io/tx/${attempt.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}</>
    : review ? <><button className="back-button" disabled={busy} onClick={()=>{setReview(null);setMessage('');}}><Icon name="back"/>Edit payment</button><h1>Ready to pay?</h1><div className="review-card"><span>You’re sending</span><div className="request-total">{units(review.approved.amountUnits)}<small>USDC</small></div><label>To wallet</label><code className="address">{review.approved.recipient}</code><div className="fee-row"><span>Network fee</span><strong>{review.feeLabel}</strong></div><p className="hint">Calculated automatically. Your fee cannot exceed this amount.</p><div className="fee-row total-row"><span>Total</span><strong>{units(review.approved.amountUnits)} USDC<br/><small>+ {review.feeLabel.toLowerCase()}</small></strong></div></div><button className="primary" disabled={busy || !!storageError} onClick={pay}>{busy?'Sending…':`Pay ${units(review.approved.amountUnits)} USDC`}<Icon name="pay"/></button><p className="hint center">Public test payment · Confirm the recipient before paying.</p></>
    : <><h1>Make a payment</h1><p className="muted">Send to a wallet or pay a request.</p><button className="scan-button" onClick={()=>{setScanning(true);setMessage('');}}><Icon name="scan" width="32" height="32"/><span>Scan a QR code</span></button><div className="divider">or paste the details</div><form onSubmit={reviewNow}><label htmlFor="payment-input">Wallet address or payment request</label><textarea id="payment-input" rows="2" placeholder="Paste address or request link" autoCapitalize="none" autoComplete="off" spellCheck="false" value={input} onChange={e=>{setInput(e.target.value);setMessage('');}} required/>{parsedInput && <p className="recipient-preview">To {short(parsedInput.recipient)}</p>}<label htmlFor="pay-amount">Amount</label><div className="amount-field"><input id="pay-amount" inputMode="decimal" placeholder="0.00" value={fixedAmount ? parsedInput.amount : amount} readOnly={fixedAmount} onChange={e=>setAmount(e.target.value)} required/><span>USDC</span></div><p className="hint">{fixedAmount?'Amount filled from the request.':'Test limit: 10 USDC.'} Fees calculated automatically.</p><button className="primary" disabled={busy || !!storageError}>{busy?'Calculating your total…':'Review payment'}<Icon name="pay"/></button></form></>}</section>}
    {message && <p className="message" role="status">{message}</p>}{storageError && active && <p className="message" role="alert">{storageError}</p>}
  </main>{active && <nav className="bottom-nav" aria-label="Main navigation">{[['wallet','Wallet'],['pay','Pay'],['request','Request'],['activity','Activity']].map(([id,label])=><button key={id} aria-current={(view === id || id==='wallet' && view==='add') && !account ? 'page' : undefined} disabled={busy} onClick={()=>go(id)}><Icon name={id}/><span>{label}</span></button>)}</nav>}</div>;
}
