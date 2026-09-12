import React, { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { createDepositActivity, DepositActivityError } from './deposit-activity.mjs';

export function DepositActivity({ connection, accountId }) {
  const latest = useRef(connection); latest.current = connection;
  const model = useRef(null), alive = useRef(false), inFlight = useRef(false);
  const [rows, setRows] = useState([]), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [checked, setChecked] = useState(null), [visible, setVisible] = useState(5);
  useEffect(() => {
    alive.current = true;
    try { model.current = createDepositActivity({ userId: accountId, getConnection: () => latest.current, isCurrent: () => alive.current }); }
    catch { setMessage('This browser cannot open saved deposit activity. Check browser storage and lock support; do not repeat an uncertain deposit.'); }
    return () => { alive.current = false; model.current?.close(); model.current = null; };
  }, [accountId]);
  const run = async (quoteId, hash) => {
    if (!model.current || inFlight.current) return;
    const selected = model.current;
    inFlight.current = true; setBusy(true); setMessage(''); setChecked(null);
    try {
      const result = quoteId ? await selected.recheck(quoteId, hash) : null;
      const next = await selected.list();
      if (!alive.current || model.current !== selected) return;
      setRows(next); setLoaded(true); setChecked(result);
    } catch (error) {
      if (alive.current && model.current === selected) {
        setMessage(error instanceof DepositActivityError ? error.message : 'Deposit activity is unavailable. Do not repeat an uncertain deposit.');
      }
    } finally { inFlight.current = false; if (alive.current && model.current === selected) setBusy(false); }
  };
  return <section className="deposit-activity" aria-labelledby="deposit-activity-heading">
    <h3 id="deposit-activity-heading">Deposit activity</h3>
    <p>Reopen saved approval and deposit attempts from this browser. Check an uncertain outcome before trying another deposit.</p>
    <button type="button" className="secondary" disabled={busy} onClick={() => { setVisible(5); void run(); }}>{busy ? 'Checking…' : loaded ? 'Refresh saved attempts' : 'Open saved attempts'}</button>
    {loaded && rows.length === 0 && <p className="notice">No attempts are saved here for this account. This does not prove a transaction was never sent from another browser or before storage was cleared.</p>}
    <ul className="receipt-list">{rows.slice(0, visible).map(row => <li key={row.quoteId} className="deposit-attempt">
      <h4>{row.stage === 'approval' ? 'USDC approval' : 'Private-wallet deposit'} · {formatUnits(BigInt(row.amountUnits), 6)} test USDC</h4>
      <p>Saved status: <strong>{row.statusLabel}</strong></p>
      <p>Recorded {new Date(row.createdAt).toLocaleString()}</p>
      <details className="wallet-details"><summary>Funding wallet and transaction</summary>
        <code>{row.fundingAddress}</code>
        {row.hash ? <><code>{row.hash}</code><a href={`https://sepolia.etherscan.io/tx/${row.hash}`} target="_blank" rel="noopener noreferrer">View transaction on Sepolia</a></> : <p>No transaction hash was saved.</p>}
      </details>
      {row.canCheck && (row.hash ? <button type="button" className="secondary" disabled={busy} onClick={() => void run(row.quoteId)}>Check transaction status</button>
        : <form onSubmit={event => { event.preventDefault(); const hash = new FormData(event.currentTarget).get('hash'); event.currentTarget.reset(); void run(row.quoteId, hash); }}>
          <label htmlFor={`deposit-hash-${row.quoteId}`}>Original transaction hash</label>
          <input id={`deposit-hash-${row.quoteId}`} name="hash" type="text" autoComplete="off" spellCheck="false" required pattern="0x[0-9a-fA-F]{64}" maxLength={66} disabled={busy}/>
          <button className="secondary" disabled={busy}>Check original transaction</button>
        </form>)}
      {checked?.quoteId === row.quoteId && <div className="notice" role="status">
        <strong>Latest check: {checked.statusLabel}</strong>
        {checked.networkFeeWei !== null && <p>Network fee: {formatUnits(BigInt(checked.networkFeeWei), 18)} Sepolia ETH.</p>}
        <p>{checked.status === 'approval-confirmed' ? 'Approval is separate from the deposit. Obtain a fresh deposit fee check before proceeding.'
          : checked.status === 'deposit-confirmed' ? 'The deposit event was verified. Sync your private wallet separately to check spendability.'
          : checked.status === 'reverted' ? 'This transaction reverted. Review the cause before any new attempt.'
          : 'The outcome is not final. Do not resend; check this original attempt again.'}</p>
      </div>}
    </li>)}</ul>
    {rows.length > visible && <button type="button" className="secondary" disabled={busy} onClick={() => setVisible(n => n + 5)}>Show more attempts</button>}
    {message && <p className="status" role="alert">{message}</p>}
    <p className="hint">Saved status is historical. Checking requests no signature and does not resend a transaction. A deposit is not a merchant payment or a private-payment receipt.</p>
  </section>;
}
