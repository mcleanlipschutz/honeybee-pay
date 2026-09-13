import React, { useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { createShieldAttemptJournal, shieldAttemptScope } from './shield-attempts.mjs';
import { createShieldSubmission } from './shield-submission.mjs';
import { assetForToken } from './shield-review.mjs';
import { createLiveShieldValidation } from './shield-live-validation.mjs';

export function ShieldConfirmation({ review, quote, client, connection, accountId, isCurrent, disabled, onBusyChange, needsNetworkSwitch }) {
  const asset = assetForToken(review.token);
  const latest = useRef(connection); latest.current = connection;
  const active = useRef(false), model = useRef(null);
  const [busy, setBusy] = useState(false), [outcome, setOutcome] = useState(null), [message, setMessage] = useState('');
  const run = async check => {
    if (active.current || disabled || !isCurrent()) return;
    active.current = true; setBusy(true); onBusyChange(true); setMessage('');
    try {
      if (!check) {
        const selected = latest.current.wallet;
        const provider = await selected.getEthereumProvider();
        const chain = BigInt(await provider.request({ method: 'eth_chainId' }));
        if (needsNetworkSwitch || chain !== 11155111n) {
          if (chain !== 11155111n) await selected.switchChain(11155111);
          if (!isCurrent()) return;
          setMessage('Switched to Sepolia. Check the network fee again before confirming.'); return;
        }
        const journal = createShieldAttemptJournal({ scope: shieldAttemptScope(accountId) });
        model.current = createShieldSubmission({ review,
          expected: { amount: formatUnits(BigInt(review.amountUnits), asset.decimals), assetId: asset.id, publicAddress: review.publicAddress,
            walletId: review.walletId, privateAddress: review.privateAddress },
          userId: accountId, getConnection: () => isCurrent() ? latest.current : null, journal,
          request: async (method, params) => {
            if (!['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBlockByNumber'].includes(method)) throw new Error('Only receipt reads are permitted');
            return provider.request({ method, params });
          },
          assertLiveValidation: createLiveShieldValidation({ review, quote, preflight: r => client.preflight(r), isCurrent }),
        });
        model.current.setQuote(quote);
      }
      const result = check ? await model.current.recheck(quote.quoteId) : await model.current.confirm(quote.quoteId);
      if (isCurrent()) setOutcome(result);
    } catch (error) { if (isCurrent()) setMessage(error.message); }
    finally { active.current = false; if (isCurrent()) { setBusy(false); onBusyChange(false); } }
  };
  return <div className="shield-confirmation">
    {!outcome && <button className="primary" type="button" disabled={disabled || busy} onClick={() => void run(false)}>
      {busy ? 'Rechecking before wallet confirmation…' : needsNetworkSwitch ? 'Switch to Sepolia' : quote.stage === 'wrap' ? `Wrap ${formatUnits(BigInt(quote.transaction.value), 18)} Sepolia ETH for fees` : quote.stage === 'approval'
        ? `Approve exactly ${formatUnits(BigInt(review.amountUnits), asset.decimals)} ${asset.label}`
        : `Confirm ${formatUnits(BigInt(review.amountUnits), asset.decimals)} ${asset.label} deposit`}
    </button>}
    {outcome && <div role="status">
      <p>Deposit step: <strong>{outcome.status}</strong></p>
      {outcome.hash && <a href={`https://sepolia.etherscan.io/tx/${outcome.hash}`} target="_blank" rel="noopener noreferrer">View original transaction on Sepolia</a>}
      {['pending', 'unknown'].includes(outcome.status) && <button className="secondary" type="button" disabled={busy} onClick={() => void run(true)}>Check original transaction</button>}
      <p>{outcome.status === 'wrap-confirmed' ? 'WETH created in your public wallet. Refresh the network fee to prepare its approval and private deposit.' : outcome.status === 'approval-confirmed' ? 'Approval confirmed. Refresh the network fee to prepare the separate deposit.'
        : outcome.status === 'deposit-confirmed' ? 'Deposit verified. Sync private balance to check when the funds become spendable.'
        : 'Check this original attempt in Deposit activity before starting another deposit.'}</p>
    </div>}
    {message && <p role="alert">{message}</p>}
  </div>;
}
