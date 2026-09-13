import React, { useEffect, useRef, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';

export function PrivatePaymentForm({ request, wallet, transact, disabled, isCurrent }) {
  const [payment, setPayment] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false), alive = useRef(true), form = useRef(null);
  useEffect(() => { alive.current = true; const timer = setInterval(() => setNow(Date.now()), 1000); return () => { alive.current = false; clearInterval(timer); form.current?.reset(); }; }, []);
  const submit = async event => {
    event.preventDefault();
    if (pending.current || disabled || !isCurrent()) return;
    const values = new FormData(event.currentTarget), action = event.nativeEvent.submitter?.value || (payment && payment.status !== 'quoted' ? 'payment-status' : 'payment-quote');
    let password = values.get('password');
    event.currentTarget.reset(); pending.current = true; setBusy(true); setMessage('');
    try {
      let fields = { password };
      if (action === 'payment-quote') {
        const fee = values.get('fee');
        if (typeof fee !== 'string' || !/^(0|1)(\.[0-9]{1,6})?$/.test(fee)) throw new Error('Enter a fee limit above zero and no more than 1 test USDC.');
        const units = parseUnits(fee, 6);
        if (units <= 0n || units > 1000000n) throw new Error('Choose a fee limit above zero and at most 1 test USDC.');
        fields = { ...fields, paymentRequest: request, maxFeeUnits: units.toString() };
      } else {
        if (!payment) throw new Error('Get a payment quote first.');
        if (action === 'payment-submit' && parseUnits(values.get('fee'), 6).toString() !== payment.quote.maxFeeUnits) throw new Error('The fee limit changed. Get a new quote before confirming.');
        fields.quoteId = payment.quote.quoteId;
      }
      setMessage(action === 'payment-submit' ? 'Generating the private proof, checking it on Sepolia, then sending through the broadcaster. This can take several minutes. Keep this page and the local server open.' : 'Checking private funds and the broadcaster fee…');
      const result = await transact(action, fields, wallet, action === 'payment-quote' ? undefined : payment.quote);
      if (alive.current && isCurrent()) { setPayment(result.privatePayment); setMessage(''); }
    } catch (error) { if (alive.current && isCurrent()) setMessage(error.message); }
    finally { password = null; pending.current = false; if (alive.current) setBusy(false); }
  };
  const quoted = payment?.status === 'quoted', current = quoted && now < payment.quote.expiresAt;
  const attempted = payment && !quoted;
  return <div className="private-payment-check">
    <h4>Pay privately with ZK</h4>
    <p>The merchant receives the requested amount. The broadcaster fee is a separate private output. Your public wallet does not broadcast this payment.</p>
    {payment && <div role="status">
      <p>Merchant: <strong>{formatUnits(BigInt(payment.quote.request.amountUnits), 6)} test USDC</strong></p>
      <p>Broadcaster fee: {formatUnits(BigInt(payment.quote.feeUnits), 6)} test USDC</p>
      <p>Total from your private wallet: <strong>{formatUnits(BigInt(payment.quote.totalUnits), 6)} test USDC</strong></p>
      <p>{quoted ? `Quote ${current ? 'expires' : 'expired'} at ${new Date(payment.quote.expiresAt).toLocaleTimeString()}.` : `Payment status: ${payment.status}`}</p>
      {payment.hash && <a href={`https://sepolia.etherscan.io/tx/${payment.hash}`} target="_blank" rel="noopener noreferrer">View private transaction on Sepolia</a>}
      {payment.receipt?.status === 'confirmed' && <p>The exact private transfer and its proof outputs were verified on Sepolia. Ask the merchant to check their received private payments.</p>}
      {payment.receipt?.requestExpiredAtSettlement && <p>This transfer settled after the request expired. Confirm acceptance with the merchant.</p>}
    </div>}
    <form ref={form} onSubmit={submit}>
      {!attempted && <><label htmlFor="private-fee-limit">Maximum broadcaster fee in test USDC</label><input key={payment?.quote.quoteId || 'new'} id="private-fee-limit" name="fee" type="text" inputMode="decimal" defaultValue={payment ? formatUnits(BigInt(payment.quote.maxFeeUnits), 6) : '0.10'} required disabled={busy || disabled}/></>}
      <label htmlFor="private-payment-password">Recovery password</label>
      <input id="private-payment-password" name="password" type="password" minLength={16} maxLength={256} autoComplete="current-password" required disabled={busy || disabled}/>
      {!attempted && <button type="submit" name="action" value="payment-quote" className="secondary" disabled={busy || disabled || now >= request.expiresAt * 1000}>{quoted ? 'Get a new quote' : 'Check total and fee'}</button>}
      {current && <button type="submit" name="action" value="payment-submit" className="primary" disabled={busy || disabled}>Confirm private payment · {formatUnits(BigInt(payment.quote.totalUnits), 6)} test USDC total</button>}
      {attempted && <button type="submit" name="action" value="payment-status" className="secondary" disabled={busy || disabled}>Check original payment</button>}
    </form>
    {message && <p role="status">{message}</p>}
    <p className="hint">Once sent, this payment may still settle after the request expires. Pending, unknown, or reverted attempts block new payments until resolved; do not issue a replacement. The transaction hash remains public; private recipient and amount are encrypted in the protocol.</p>
  </div>;
}
