import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { createPaymentRequestReader, paymentRequestFile } from './private-request.mjs';

function RequestDetails({ request, now }) {
  return <dl className="request-details">
    <dt>Amount</dt><dd><strong>{formatUnits(BigInt(request.amountUnits), 6)} test USDC</strong></dd>
    <dt>Network</dt><dd>Ethereum Sepolia testnet</dd>
    <dt>Request reference</dt><dd><code>{request.id}</code></dd>
    <dt>Expires</dt><dd>{new Date(request.expiresAt * 1000).toLocaleString()}{now >= request.expiresAt && <strong> — Expired</strong>}</dd>
    <dt>Merchant’s private receiving address</dt><dd><code>{request.recipient}</code></dd>
  </dl>;
}

// Parent mounts one instance per signed-in account. Decrypted requests remain
// in page memory; merchant history is encrypted by the local account worker.
export function PrivatePaymentRequests({ created, history, onCloseHistory, isCurrent }) {
  const [imported, setImported] = useState(null), [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState(null), [visible, setVisible] = useState(10);
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
  useEffect(() => { setSelectedId(null); setVisible(10); }, [history]);
  const selected = history?.requests.find(request => request.id === selectedId) || created;
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
  return <section className="private-requests" aria-labelledby="request-heading">
    <h3 id="request-heading">Payment requests</h3>
    <p>Create a request for a buyer, or open one you received from a merchant. Private payment submission is still in development.</p>
    {selected && <div className="notice" aria-label="Merchant payment request">
      <h4>Your payment request</h4>
      <RequestDetails request={selected} now={now}/>
      <p>Payment status: not checked. This record does not confirm payment.</p>
      <p>This file includes the amount and private receiving address. It is not encrypted; share it only with the intended buyer.</p>
      <button type="button" className="secondary" onClick={save} disabled={now >= selected.expiresAt}>Download payment request</button>
    </div>}
    {history && <div className="request-history" aria-label="Saved merchant requests">
      <h4>Your saved requests</h4>
      <p>Encrypted on this computer. Your wallet recovery backup does not include this history.</p>
      {history.requests.length === 0 ? <p>No saved requests yet. Requests made before history was added will not appear here.</p> : <>
        <p>{history.requests.length} saved · Payment status not checked</p>
        <ul>{history.requests.slice(0, visible).map(request => <li key={request.id}>
          <button type="button" className="request-history-item" aria-pressed={selected?.id === request.id}
            onClick={() => { setSelectedId(request.id); setMessage(''); }}>
            <strong>{formatUnits(BigInt(request.amountUnits), 6)} test USDC</strong>
            <span>{now >= request.expiresAt ? 'Expired request' : 'Active request'} · {new Date(request.createdAt * 1000).toLocaleString()}</span>
            <code>{request.id}</code>
          </button>
        </li>)}</ul>
        {history.requests.length > visible && <button type="button" className="secondary" onClick={() => setVisible(count => count + 10)}>Show more requests</button>}
      </>}
      <button type="button" className="secondary" onClick={onCloseHistory}>Close history</button>
    </div>}
    <label htmlFor="payment-request-file">Open a merchant’s request</label>
    <input id="payment-request-file" type="file" accept="application/json,.json" onChange={open}/>
    <p className="hint">Choose a Honeybee request JSON file, up to 4 KB. It stays in this page and is cleared when you sign out.</p>
    {imported && <div className="notice" aria-label="Imported payment request">
      <h4>{now < imported.expiresAt ? 'Review the merchant’s request' : 'This request has expired'}</h4>
      <RequestDetails request={imported} now={now}/>
      <p>{now < imported.expiresAt ? 'Confirm the reference and terms with the merchant through a channel you trust. A request file does not verify their identity.' : 'Ask the merchant for a new request before proceeding.'}</p>
      <p>Opening this file does not authorize a payment. This is a request, not a receipt.</p>
      <button type="button" className="secondary" onClick={() => { operation.current++; reader.clear(); setImported(null); setMessage(''); }}>Clear request</button>
    </div>}
    {message && <p role="status" className="status">{message}</p>}
  </section>;
}
