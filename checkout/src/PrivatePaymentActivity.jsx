import React, { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';

export function PrivatePaymentActivity({ wallet, transact, disabled, isCurrent }) {
  const [rows, setRows] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef(false), alive = useRef(true), form = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; form.current?.reset(); }; }, []);
  const submit = async event => {
    event.preventDefault(); if (pending.current || disabled || !isCurrent()) return;
    const values = new FormData(event.currentTarget), selected = event.nativeEvent.submitter?.value;
    let password = values.get('password');
    const original = rows?.find(p => p.quote.quoteId === selected);
    const candidate = original && values.get(`hash-${selected}`)?.trim();
    event.currentTarget.reset(); pending.current = true; setBusy(true); setMessage('');
    try {
      const result = await transact(original ? 'payment-status' : 'payment-history',
        { password, ...(original ? { quoteId: selected, ...(candidate ? { hash: candidate } : {}) } : {}) }, wallet, original?.quote);
      if (alive.current && isCurrent()) setRows(previous => original
        ? previous.map(p => p.quote.quoteId === selected ? result.privatePayment : p) : result.privatePayments);
    } catch (error) { if (alive.current && isCurrent()) setMessage(error.message); }
    finally { password = null; pending.current = false; if (alive.current) setBusy(false); }
  };
  return <details className="wallet-tools"><summary>Saved private payments</summary>
    <p>Reopen the original attempt after a reload or interrupted connection. Saved status is historical; check the original transaction for its current result.</p>
    <form ref={form} onSubmit={submit}>
      <label htmlFor="private-history-password">Recovery password</label><input id="private-history-password" name="password" type="password" autoComplete="current-password" minLength={16} maxLength={256} required disabled={busy || disabled}/>
      <button className="secondary" type="submit" value="list" disabled={busy || disabled}>{busy ? 'Checking…' : 'Open saved private payments'}</button>
      {rows?.length === 0 && <p>No private payments are saved for this wallet on this computer.</p>}
      {rows?.map(row => <div className="notice" key={row.quote.quoteId}>
        <p><strong>{formatUnits(BigInt(row.quote.request.amountUnits), 6)} test USDC</strong> · {row.status === 'quoted' ? 'Not submitted' : row.status}</p>
        <p>Request: {row.quote.request.id}</p>
        {row.hash && <a href={`https://sepolia.etherscan.io/tx/${row.hash}`} target="_blank" rel="noopener noreferrer">View original transaction</a>}
        {row.status === 'unknown' && !row.hash && <><label htmlFor={`hash-${row.quote.quoteId}`}>Original transaction hash, if available</label><input id={`hash-${row.quote.quoteId}`} name={`hash-${row.quote.quoteId}`} type="text" pattern="0x[0-9a-fA-F]{64}" maxLength={66} disabled={busy || disabled}/></>}
        {row.status !== 'quoted' && <button className="secondary" type="submit" value={row.quote.quoteId} disabled={busy || disabled}>Check original payment</button>}
        {row.status === 'reverted' && <p>The Ethereum transaction reverted, but the private authorization may still execute. New private payments remain blocked; keep checking the original attempt.</p>}
        {row.receipt?.requestExpiredAtSettlement && <p>Settled after the request expired; confirm acceptance with the merchant.</p>}
      </div>)}
    </form>
    {message && <p role="alert">{message}</p>}
  </details>;
}
