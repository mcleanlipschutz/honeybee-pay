import React, { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';

export function PrivatePaymentActivity({ wallet, transact, disabled, isCurrent }) {
  const [rows, setRows] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [review, setReview] = useState(null);
  const pending = useRef(false), alive = useRef(true), form = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; form.current?.reset(); }; }, []);
  const run = async (action, original) => {
    if (pending.current || disabled || !alive.current || !isCurrent()) return;
    if (!form.current?.reportValidity()) return;
    if (action === 'payment-redelivery-submit' && (!review || review.quoteId !== original?.quote.quoteId
        || review.expiresAt <= Date.now() || original.status !== 'unknown' || original.hash)) {
      setReview(null); setMessage('The delivery review expired or changed. Review the original delivery again.'); return;
    }
    const values = new FormData(form.current);
    let password = values.get('password');
    const selected = original?.quote.quoteId;
    const candidate = action === 'payment-status' && values.get(`hash-${selected}`)?.trim();
    const fields = { password, ...(selected ? { quoteId: selected } : {}),
      ...(candidate ? { hash: candidate } : {}), ...(action === 'payment-redelivery-submit' ? { reviewId: review.reviewId } : {}) };
    form.current.reset(); pending.current = true; setBusy(true); setReview(null);
    setMessage(action === 'payment-redelivery-submit' ? 'Retrying delivery of the original payment. Keep this page and the local server open.'
      : action === 'payment-redelivery-review' ? 'Checking the original payment and broadcaster fee. This review does not send a payment.' : 'Checking saved payment information…');
    try {
      const result = await transact(action, fields, wallet, original?.quote);
      if (alive.current && isCurrent()) {
        setRows(previous => original ? previous.map(p => p.quote.quoteId === selected ? result.privatePayment : p) : result.privatePayments);
        setReview(result.deliveryReview || null);
        setMessage(result.deliveryReview ? 'Delivery review ready. Re-enter your recovery password and click Confirm original delivery retry to authorize.'
          : action === 'payment-redelivery-submit' ? 'Delivery attempt saved. Check original payment for its current result.' : '');
      }
    } catch (error) { if (alive.current && isCurrent()) setMessage(error.message); }
    finally { password = null; fields.password = null; pending.current = false; if (alive.current) setBusy(false); }
  };
  const submit = event => { event.preventDefault(); };
  const enter = event => {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
      event.preventDefault(); setMessage('Choose the action button. A delivery retry requires its explicit confirmation button.');
    }
  };
  return <details className="wallet-tools"><summary>Saved private payments</summary>
    <p>Reopen the original attempt after a reload or interrupted connection. Saved status is historical; check the original transaction for its current result.</p>
    <form ref={form} onSubmit={submit} onKeyDown={enter}>
      <label htmlFor="private-history-password">Recovery password</label><input id="private-history-password" name="password" type="password" autoComplete="current-password" minLength={16} maxLength={256} required disabled={busy || disabled}/>
      <button className="secondary" type="button" onClick={() => run('payment-history')} disabled={busy || disabled}>{busy ? 'Working…' : 'Open saved private payments'}</button>
      {rows?.length === 0 && <p>No private payments are saved for this wallet on this computer.</p>}
      {rows?.map(row => <div className="notice" key={row.quote.quoteId}>
        <p><strong>{formatUnits(BigInt(row.quote.request.amountUnits), 6)} test USDC</strong> · {row.status === 'quoted' ? 'Not submitted' : row.status}</p>
        <p>Request: {row.quote.request.id}</p>
        {row.hash && <a href={`https://sepolia.etherscan.io/tx/${row.hash}`} target="_blank" rel="noopener noreferrer">View original transaction</a>}
        {row.status === 'unknown' && !row.hash && <><label htmlFor={`hash-${row.quote.quoteId}`}>Original transaction hash, if available</label><input id={`hash-${row.quote.quoteId}`} name={`hash-${row.quote.quoteId}`} type="text" pattern="0x[0-9a-fA-F]{64}" maxLength={66} disabled={busy || disabled}/></>}
        {row.status !== 'quoted' && <button className="secondary" type="button" onClick={() => run('payment-status', row)} disabled={busy || disabled}>Check original payment</button>}
        {row.status === 'unknown' && !row.hash && row.quote.version === 2 && <>
          <p>If delivery was interrupted, review a retry of this same saved payment. Its merchant amount and broadcaster fee stay the same. Do not create a replacement request or payment.</p>
          {review?.quoteId === row.quote.quoteId ? <>
            <h4>Review original delivery retry</h4>
            <p>Ethereum Sepolia testnet</p>
            <p>Merchant: <strong>{formatUnits(BigInt(row.quote.request.amountUnits), 6)} test USDC</strong></p>
            <details><summary>Original receiving address</summary><p style={{ overflowWrap: 'anywhere' }}>{row.quote.request.recipient}</p></details>
            <p>Broadcaster fee: <strong>{formatUnits(BigInt(row.quote.feeUnits), 18)} Sepolia WETH</strong></p>
            <p>This sends the saved payment again for delivery. The same private notes authorize the merchant amount and fee once. Its status may remain unknown until settlement is verified.</p>
            <p>Delivery review expires at {new Date(review.expiresAt).toLocaleTimeString()}.</p>
            <button type="button" onClick={() => run('payment-redelivery-submit', row)} disabled={busy || disabled}>Confirm original delivery retry · {formatUnits(BigInt(row.quote.request.amountUnits), 6)} test USDC + {formatUnits(BigInt(row.quote.feeUnits), 18)} Sepolia WETH fee</button>
            <button className="secondary" type="button" onClick={() => { setReview(null); form.current?.reset(); }} disabled={busy || disabled}>Cancel delivery review</button>
          </> : <button className="secondary" type="button" onClick={() => run('payment-redelivery-review', row)} disabled={busy || disabled}>Review original delivery retry</button>}
        </>}
        {row.status === 'reverted' && <p>The Ethereum transaction reverted, but the private authorization may still execute. New private payments remain blocked; keep checking the original attempt.</p>}
        {row.receipt?.requestExpiredAtSettlement && <p>Settled after the request expired; confirm acceptance with the merchant.</p>}
      </div>)}
    </form>
    {message && <p role="alert">{message}</p>}
  </details>;
}
