import React, { useEffect, useState } from 'react';

export function PaymentCount() {
  const [count, setCount] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const response = await fetch('/api/payment-count', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (data.network !== 'sepolia' || !Number.isSafeInteger(data.testPayments) || data.testPayments < 0) throw new Error();
        if (active) { setCount(data.testPayments); setUnavailable(false); }
      } catch { if (active) setUnavailable(true); }
      finally { running = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 60000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, []);
  return <section className="payment-count" aria-label="Honeybee Pay usage">
    <div><strong aria-live="polite">{unavailable ? '—' : count === null ? '…' : count.toLocaleString()}</strong><span>Test payments completed</span></div>
    <p>{unavailable ? 'Count temporarily unavailable.' : 'Confirmed Honeybee Pay checkouts on Sepolia. No real money.'}</p>
    <details><summary>What this counts</summary><p>Each completed payment counts once after the network finalizes it, usually within about 15 minutes. Funding transfers, failed attempts and transfers to the same wallet are excluded. This is a payment count, not a count of customers or a security rating.</p></details>
  </section>;
}
