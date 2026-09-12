import React, { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';

// Mounted by request digest and wallet identity. Replacement, clearing or
// sign-out unmounts this instance and discards its in-flight observation.
export function PrivatePaymentCheck({ request, wallet, checkPayment, disabled, isCurrent }) {
  const [check, setCheck] = useState(null), [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false), [now, setNow] = useState(Date.now());
  const alive = useRef(true), controller = useRef(null), formRef = useRef(null);
  const current = useRef(isCurrent); current.current = isCurrent;
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive.current = false; clearInterval(timer); controller.current?.abort(); formRef.current?.reset(); };
  }, []);
  const submit = async event => {
    event.preventDefault();
    if (controller.current || disabled || !current.current()) return;
    let password = new FormData(event.currentTarget).get('password');
    event.currentTarget.reset(); setCheck(null); setMessage(''); setChecking(true);
    const pending = new AbortController(); controller.current = pending;
    try {
      const response = await checkPayment(request, password, wallet, pending.signal);
      if (alive.current && current.current() && !pending.signal.aborted) {
        setCheck(response.paymentCheck); setNow(Date.now());
      }
    } catch (error) {
      if (alive.current && current.current() && !pending.signal.aborted) setMessage(error.message);
    } finally {
      password = null; controller.current = null;
      if (alive.current) setChecking(false);
    }
  };
  const expired = now >= request.expiresAt * 1000;
  const fresh = check && now < check.expiresAt && !expired;
  return <div className="private-payment-check">
    <h4>Check private funds</h4>
    <p>Compare this request with your spendable private test USDC. Checking can take up to two minutes and does not authorize payment.</p>
    <form ref={formRef} onSubmit={submit}>
      <label htmlFor="payment-check-password">Recovery password</label>
      <input id="payment-check-password" name="password" type="password" autoComplete="current-password"
        minLength={16} maxLength={256} required disabled={disabled || checking || expired}/>
      <button className="secondary" disabled={disabled || checking || expired}>{checking ? 'Checking private funds…' : 'Check private funds'}</button>
    </form>
    {check && <div role="status">
      {fresh ? <>
        <p><strong>{check.coversRequestedAmount ? 'Your private funds cover the requested amount.' : 'Your private funds do not cover this request.'}</strong></p>
        <p>Available: {formatUnits(BigInt(check.balanceUnits), 6)} test USDC.</p>
        {!check.coversRequestedAmount && <p>Shortfall: {formatUnits(BigInt(check.shortfallUnits), 6)} test USDC.</p>}
        <p>Check expires at {new Date(check.expiresAt).toLocaleTimeString()}. Funds are not reserved.</p>
      </> : <p>This balance check has expired. {expired ? 'Ask the merchant for a new request.' : 'Check private funds again.'}</p>}
      <p>Payment fees have not been checked. Private payment submission is still in development.</p>
    </div>}
    {message && <p role="status" className="status">{message}</p>}
  </div>;
}
