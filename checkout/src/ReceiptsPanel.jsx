import React, { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { findPublicReceipts, loadPublicReceiptPage, receiptText, ReceiptError, sortReceipts } from './receipts.mjs';

const short = value => `${value.slice(0, 8)}…${value.slice(-6)}`;
const date = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export function ReceiptsPanel({ connection }) {
  const wallet = connection?.ready && connection.authenticated ? connection.wallet?.address : undefined;
  const [records, setRecords] = useState([]), [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [nextBlock, setNextBlock] = useState(undefined), [error, setError] = useState('');
  const [filter, setFilter] = useState('all'), [hash, setHash] = useState('');
  const request = useRef(null), alive = useRef(true), inFlight = useRef(false);
  const run = async (kind, transactionHash) => {
    if (!wallet || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    request.current = new AbortController();
    if (kind === 'refresh') { setRecords([]); setSelected(null); setLoaded(false); setNextBlock(undefined); }
    try {
      const result = kind === 'find'
        ? { records: await findPublicReceipts({ wallet, hash: transactionHash.trim(), signal: request.current.signal }) }
        : await loadPublicReceiptPage({ wallet, beforeBlock: kind === 'older' ? nextBlock : undefined, signal: request.current.signal });
      if (!alive.current) return;
      setRecords(previous => sortReceipts(kind === 'refresh' ? result.records : [...previous, ...result.records]));
      if (kind !== 'find') { setNextBlock(result.nextBlock); setLoaded(true); }
      else { setSelected(result.records[0]); setFilter('all'); }
    } catch (cause) {
      if (alive.current && !request.current.signal.aborted) setError(cause instanceof ReceiptError ? cause.message : 'Receipts could not be loaded. Check your connection and try again.');
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => {
    alive.current = true;
    if (wallet) void run('refresh');
    return () => { alive.current = false; request.current?.abort(); };
  }, [wallet]);
  const download = record => {
    const url = URL.createObjectURL(new Blob([receiptText(record)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `honeybee-receipt-${record.transactionHash.slice(2, 14)}-${record.logIndex}.txt`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const visible = records.filter(record => filter === 'all' || record.direction === filter);
  return <section className="checkout wallet-panel receipts-panel" aria-labelledby="receipts-heading">
    <div className="card-top"><span className="eyebrow">YOUR PAYMENT RECORDS</span><span className="pill">Sepolia USDC</span></div>
    <h2 id="receipts-heading">Receipts</h2>
    <p className="subtext">Reopen sent and received transfers, or save a copy for your records.</p>
    {!wallet ? <div className="notice"><p>{connection?.authenticated ? 'Waiting for your wallet to load.' : 'Sign in to see this wallet’s receipts.'}</p><button className="secondary" disabled={!connection?.ready || connection.authenticated} onClick={() => connection.login()}>Sign in with email</button></div> : <>
      <div className="wallet-row"><div><span className="label">CURRENT WALLET</span><strong>{short(wallet)}</strong></div><button className="secondary" disabled={busy} onClick={() => run('refresh')}>Refresh</button></div>
      <p className="history-note">Read from the public blockchain each time you return, including faucet funding and transfers made outside Honeybee. Earlier activity is available with “Load older.”</p>
      <div className="receipt-filters" role="group" aria-label="Filter receipts">{[['all','All'],['sent','Sent'],['received','Received']].map(([value,label]) => <button key={value} className="secondary" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      {busy && <p className="status" role="status">Checking confirmed USDC transfers…</p>}
      {error && <p className="status" role="alert">{error}</p>}
      {!busy && loaded && !visible.length && <p className="notice">No {filter === 'all' ? '' : filter + ' '}transfers found in the blocks loaded so far.</p>}
      <ul className="receipt-list">{visible.map(record => <li key={record.id}><button className="receipt-item" aria-expanded={selected?.id === record.id} onClick={() => setSelected(selected?.id === record.id ? null : record)}>
        <span><strong>{record.direction === 'sent' ? 'Sent' : record.direction === 'received' ? 'Received' : 'Self-transfer'} {formatUnits(BigInt(record.amountUnits), record.decimals)} USDC</strong><small>{date(record.date)}</small><small>{record.direction === 'sent' ? 'To ' + short(record.recipient) : 'From ' + short(record.sender)}</small></span><span className="receipt-status">Confirmed</span>
      </button>{selected?.id === record.id && <div className="receipt-detail">
        <h3>Transfer receipt</h3><dl><dt>Amount</dt><dd>{formatUnits(BigInt(record.amountUnits), record.decimals)} USDC</dd><dt>Date (UTC)</dt><dd>{record.date}</dd><dt>Sender</dt><dd><code>{record.sender}</code></dd><dt>Recipient</dt><dd><code>{record.recipient}</code></dd><dt>Network</dt><dd>Ethereum Sepolia · Public transfer</dd><dt>Transaction</dt><dd><code>{record.transactionHash}</code></dd><dt>Receipt reference</dt><dd><code>{record.id}</code></dd></dl>
        <p>Confirmed after at least two blocks. This records a token transfer; it does not confirm delivery of goods.</p>
        <div className="receipt-actions"><button className="secondary" onClick={() => download(record)}>Download receipt</button><a href={`https://sepolia.etherscan.io/tx/${record.transactionHash}`} target="_blank" rel="noreferrer">View on Sepolia ↗</a></div>
      </div>}</li>)}</ul>
      {loaded && nextBlock !== null && <button className="secondary older-receipts" disabled={busy} onClick={() => run('older')}>Load older</button>}
      <details className="receipt-search"><summary>Find a transaction by its hash</summary><form onSubmit={event => { event.preventDefault(); void run('find', hash); }}><label htmlFor="receipt-hash">Transaction hash</label><input id="receipt-hash" value={hash} onChange={event => setHash(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck="false" required pattern="0x[0-9a-fA-F]{64}"/><button className="secondary" disabled={busy}>Find receipt</button></form></details>
    </>}
    <div className="card-bottom"><span>Test assets only</span><span>Public transfer receipts</span></div>
  </section>;
}
