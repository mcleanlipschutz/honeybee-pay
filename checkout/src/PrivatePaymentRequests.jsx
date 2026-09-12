import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { createPaymentRequestReader, paymentRequestFile } from './private-request.mjs';
import { validateHistoryBackup } from '../../shared/request-history-backup.mjs';
import { PrivatePaymentCheck } from './PrivatePaymentCheck.jsx';

function RequestDetails({ request, now }) {
  return <>
    <div className="request-amount"><strong>{formatUnits(BigInt(request.amountUnits), 6)}</strong><span>test USDC</span></div>
    <p className="request-network">Ethereum Sepolia testnet</p>
    <p>Expires {new Date(request.expiresAt * 1000).toLocaleString()}{now >= request.expiresAt && <strong> · Expired</strong>}</p>
    <details className="request-identifiers"><summary>Request reference & receiving address</summary><dl className="request-details">
    <dt>Request reference</dt><dd><code>{request.id}</code></dd>
    <dt>Merchant’s private receiving address</dt><dd><code>{request.recipient}</code></dd>
    </dl></details>
  </>;
}

// Parent mounts one instance per signed-in account. Decrypted requests remain
// in page memory; merchant history is encrypted by the local account worker.
export function PrivatePaymentRequests({ view, created, history, encryptedHistory, onCloseHistory, isCurrent, wallet, checkPayment, busy }) {
  const [imported, setImported] = useState(null), [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState(null), [visible, setVisible] = useState(10);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const alive = useRef(true), operation = useRef(0), current = useRef(isCurrent); current.current = isCurrent;
  const reader = useMemo(() => createPaymentRequestReader({ isCurrent: () => alive.current && current.current() }), []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current++; reader.clear(); }; }, [reader]);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    if (!created && !imported && !history) return;
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, [created, imported, history]);
  useEffect(() => { setSelectedId(created?.id ?? null); setVisible(10); setHistoryOpen(!!history && !created); }, [created, history]);
  const selected = history?.requests.find(request => request.id === selectedId) || (created?.id === selectedId ? created : null);
  const open = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    const selection = ++operation.current;
    setImported(null); setMessage(''); reader.clear();
    if (!file) return;
    try {
      const request = await reader.read(file);
      if (alive.current && current.current() && operation.current === selection) {
        setImported(request); setNow(Math.floor(Date.now() / 1000));
      }
    } catch (error) {
      if (alive.current && current.current() && operation.current === selection) setMessage(error.message);
    }
  };
  const save = () => {
    if (!current.current()) return;
    try {
      const text = paymentRequestFile(selected); // Historical viewing never bypasses current expiry.
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `honeybee-request-${selected.id}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMessage(error.message); }
  };
  const saveHistory = () => {
    if (!current.current()) return;
    try {
      const text = validateHistoryBackup(encryptedHistory);
      const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = 'honeybee-request-history.encrypted.json';
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMessage(error.message); }
  };
  return <section className="private-requests" aria-label={view === 'pay' ? 'Open a merchant request' : 'Saved payment requests'}>
    {view !== 'pay' && encryptedHistory && <div className="notice protected">
        <strong>Your encrypted history backup is ready.</strong>
        <p>Keep it with your wallet backup. Restore the wallet first, then its history.</p>
        <button type="button" className="secondary" onClick={saveHistory}>Download encrypted history backup</button>
    </div>}
    {view !== 'pay' && history && <details className="request-history" open={historyOpen} onToggle={event => setHistoryOpen(event.currentTarget.open)}>
      <summary>Saved requests <span>{history.requests.length}</span></summary>
      <p className="hint">Encrypted on this computer. Payment status has not been checked.</p>
      {history.requests.length === 0 ? <p>No saved requests yet. Requests made before history was added will not appear here.</p> : <>
        <ul>{history.requests.slice(0, visible).map(request => <li key={request.id}>
          <button type="button" className="request-history-item" aria-pressed={selected?.id === request.id}
            onClick={() => { setSelectedId(request.id); setHistoryOpen(false); setMessage(''); }}>
            <strong>{formatUnits(BigInt(request.amountUnits), 6)} test USDC</strong>
            <span>{now >= request.expiresAt ? 'Expired request' : 'Active request'} · {new Date(request.createdAt * 1000).toLocaleString()}</span>
            <span className="request-reference-preview">Reference {request.id.slice(0, 8)}… · View details</span>
          </button>
        </li>)}</ul>
        {history.requests.length > visible && <button type="button" className="secondary" onClick={() => setVisible(count => count + 10)}>Show more requests</button>}
      </>}
      <button type="button" className="secondary" onClick={onCloseHistory}>Close history</button>
    </details>}
    {view !== 'pay' && selected && <div className="request-card" aria-label="Merchant payment request">
      <div className="request-card-heading"><h4>Your payment request</h4><button type="button" className="text-button" onClick={() => setSelectedId(null)}>Close details</button></div>
      <RequestDetails request={selected} now={now}/>
      <p className="request-state">Payment status not checked · This is not a receipt.</p>
      <p className="hint">The request file is not encrypted. Share it only with the intended buyer.</p>
      <button type="button" className="primary" onClick={save} disabled={busy || now >= selected.expiresAt}>Download payment request</button>
    </div>}
    {view === 'pay' && <>
    <div className="request-upload"><label htmlFor="payment-request-file">{imported ? 'Choose a different request' : 'Open a merchant’s request'}</label>
    <input id="payment-request-file" type="file" accept="application/json,.json" disabled={busy} onChange={open}/>
    <p className="hint">Choose the merchant’s Honeybee request file (.json). Opening it does not authorize payment.</p></div>
    {imported && <div className="request-card" aria-label="Imported payment request">
      <h4>{now < imported.expiresAt ? 'Review the merchant’s request' : 'This request has expired'}</h4>
      <RequestDetails request={imported} now={now}/>
      <p>{now < imported.expiresAt ? 'Confirm the reference and terms with the merchant through a channel you trust. A request file does not verify their identity.' : 'Ask the merchant for a new request before proceeding.'}</p>
      <p className="request-state">Request only · No payment authorized.</p>
      {checkPayment && wallet?.id && <PrivatePaymentCheck key={`${imported.digest}:${wallet.id}:${wallet.privateAddress}`}
        request={imported} wallet={wallet} checkPayment={checkPayment} disabled={busy} isCurrent={isCurrent}/>}
      {checkPayment && !wallet?.id && <p className="hint">To check private funds, first choose Wallet → Check my wallet, then reopen this request.</p>}
      <button type="button" className="text-button" disabled={busy} onClick={() => { operation.current++; reader.clear(); setImported(null); setMessage(''); }}>Clear request</button>
    </div>}
    </>}
    {message && <p role="status" className="status">{message}</p>}
  </section>;
}
