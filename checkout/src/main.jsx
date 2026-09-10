import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider, usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { createPublicClient, http, erc20Abi, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { CHAIN_ID, USDC, approvePayment, buildTransfer, verifyReceipt } from './payment.mjs';
import { PrivateWalletPanel } from './PrivateWalletPanel.jsx';
import { ReceiptsPanel } from './ReceiptsPanel.jsx';
import { HostedWalletPanel } from './HostedWalletPanel.jsx';
import { isLocalDemo } from './account-client.mjs';
import './style.css';
import { PaymentCount } from './PaymentCount.jsx';
import { trackPayment } from './payment-tracking.mjs';

const rpc = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com', { timeout: 15000, retryCount: 2 }) });
const short = address => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Not connected';
function ConnectedCheckout({ runtime }) {
  const { ready, authenticated, login, logout, user, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const wallet = wallets.find(w => w.walletClientType === 'privy');
  return <Checkout key={authenticated && user?.id || 'signed-out'} runtime={runtime} connection={{ ready: ready && walletsReady, authenticated, userId: user?.id, getAccessToken, wallet, login, logout, sendTransaction }} />;
}
function Checkout({ connection, runtime }) {
  const [view, setView] = useState('wallet');
  const [recipient, setRecipient] = useState(import.meta.env.VITE_MERCHANT_ADDRESS || '');
  const [amount, setAmount] = useState('1.00');
  const [approval, setApproval] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [details, setDetails] = useState(false);
  const inFlight = useRef(false);
  const trackedIntent = useRef(null);
  const current = useRef(connection); current.current = connection;
  useEffect(() => () => { current.current = null; }, []);
  const wallet = connection?.wallet;
  const localWalletSetup = runtime?.mode === 'local-testnet' && isLocalDemo(window.location.origin);
  const active = connection?.ready && connection?.authenticated && wallet;
  const review = event => {
    event.preventDefault(); setMessage(''); setBlocked(false);
    try {
      if (!active) throw new Error('Connect your Privy wallet to review a payment.');
      setApproval(approvePayment({ recipient, amount, sender: wallet.address }));
    } catch (error) { setMessage(error.message); }
  };
  const checkReceipt = async (txHash, approved) => {
    setMessage('Transaction submitted. Waiting for two confirmations…');
    const mined = await rpc.waitForTransactionReceipt({ hash: txHash, confirmations: 2, timeout: 120_000 });
    setReceipt(verifyReceipt(mined, approved)); setHash(mined.transactionHash); setMessage('');
  };
  const pay = async () => {
    if (inFlight.current || hash) return;
    inFlight.current = true; setBusy(true); setMessage('Checking wallet, network and balance…');
    let submitted = false;
    try {
      const selected = current.current?.wallet;
      if (!current.current?.authenticated || !selected) throw new Error('Reconnect your wallet and review again.');
      buildTransfer(approval, approval, selected.address);
      await selected.switchChain(CHAIN_ID);
      const provider = await selected.getEthereumProvider();
      const chain = await provider.request({ method: 'eth_chainId' });
      const accounts = await provider.request({ method: 'eth_accounts' });
      if (Number(chain) !== CHAIN_ID || !accounts.some(a => a.toLowerCase() === approval.sender.toLowerCase())) throw new Error('Wallet or network changed. Review again.');
      const [rpcChain, code, decimals, balance, gas] = await Promise.all([
        rpc.getChainId(), rpc.getCode({ address: USDC }),
        rpc.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' }),
        rpc.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [approval.sender] }),
        rpc.getBalance({ address: approval.sender }),
      ]);
      if (rpcChain !== CHAIN_ID || !code || code === '0x' || decimals !== 6) throw new Error('Sepolia USDC checks failed. Payment stopped.');
      if (balance < BigInt(approval.amountUnits)) throw new Error('Add Sepolia test USDC to your buyer wallet first.');
      if (gas === 0n) throw new Error('Add Sepolia test ETH for the network fee first.');
      await rpc.simulateContract({ account: approval.sender, address: USDC, abi: erc20Abi, functionName: 'transfer', args: [approval.recipient, BigInt(approval.amountUnits)] });
      if (!current.current?.authenticated || current.current.wallet?.address !== selected.address) throw new Error('Wallet changed. Review again.');
      const transaction = buildTransfer(approval, approval, selected.address);
      if (!localWalletSetup) {
        setMessage('Preparing your payment record…');
        const intent = await trackPayment('/api/payment-intents', { sender: approval.sender, recipient: approval.recipient, amount: formatUnits(BigInt(approval.amountUnits), 6), expiresAt: approval.expiresAt }, current.current.getAccessToken);
        trackedIntent.current = intent.id;
        buildTransfer(approval, approval, current.current?.wallet?.address);
      }
      setMessage('Confirm the reviewed payment in your Privy wallet.');
      const result = await current.current.sendTransaction(transaction, { address: selected.address, uiOptions: { showWalletUIs: true } });
      submitted = true; setHash(result.hash);
      if (trackedIntent.current) {
        // The server also recovers a signed payment if this report is interrupted.
        void trackPayment('/api/payment-submissions', { id: trackedIntent.current, hash: result.hash }, connection.getAccessToken).catch(() => {});
      }
      await checkReceipt(result.hash, approval);
    } catch (error) {
      // SDK/provider error objects can contain request details. Show controlled copy.
      const safe = ['Reconnect', 'Wallet', 'Approval', 'Sepolia', 'Add ', 'Payment blocked', 'Payment tracking'];
      setMessage(submitted ? 'Transaction submitted; receipt verification is not complete. Recheck below before making another payment.'
        : safe.some(prefix => error.message?.startsWith(prefix)) ? error.message : 'Payment was not confirmed. Check your wallet and try again.');
    } finally { inFlight.current = false; setBusy(false); }
  };
  const recheck = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await checkReceipt(hash, approval); } catch { setMessage('Receipt remains unverified. Keep the transaction link and check again.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const attack = () => {
    const changed = { ...approval, recipient: approval.sender };
    try { buildTransfer(approval, changed, approval.sender); } catch { setBlocked(true); }
  };
  return <div className="shell">
    <header><a className="brand" href="/" aria-label="Honeybee Pay home"><span className="mark">h.</span>honeybee<span className="brand-light">pay</span></a><span className="network"><i/>Sepolia testnet</span></header>
    <PaymentCount/>
    <nav className="view-switch" aria-label="Honeybee sections"><button aria-pressed={view === 'wallet'} disabled={busy || (!!hash && !receipt)} onClick={() => setView('wallet')}>Wallet setup</button><button aria-pressed={view === 'checkout'} onClick={() => setView('checkout')}>Public test checkout</button><button aria-pressed={view === 'receipts'} disabled={busy || (!!hash && !receipt)} onClick={() => setView('receipts')}>Receipts</button></nav>
    <main>
      <section className="intro"><span className="eyebrow">A LITTLE SIMPLER. A LITTLE SAFER.</span><h1>Good payments.<br/><span>Your rules.</span></h1><p>A checkout that keeps you in control.<br/>Choose the merchant. Review the amount.<br/>Approve exactly what you mean to pay.</p><div className="intro-note"><span className="circle">✓</span><span>Built for everyday payments.<small>Testing with USDC on Sepolia.</small></span></div><div className="honey-art" aria-hidden="true"><div className="hex one"/><div className="hex two"/><div className="hex three"/><span>MAKE IT<br/>HONEYBEE.</span></div></section>
      {view === 'receipts' ? <ReceiptsPanel key={`${connection?.userId || 'signed-out'}:${wallet?.address || ''}`} connection={connection}/> : view === 'wallet' ? (localWalletSetup ? <PrivateWalletPanel key={connection?.userId || 'preview'} connection={connection} runtime={runtime}/> : <HostedWalletPanel key={connection?.userId || 'preview'} connection={connection}/>) : <section className="checkout" aria-labelledby="checkout-heading"><div className="card-top"><span className="eyebrow">HONEYBEE CHECKOUT</span><span className="pill">Test payment</span></div><h2 id="checkout-heading">{receipt ? 'Payment received.' : approval ? 'Everything look right?' : 'Let’s make a payment.'}</h2><p className="subtext">{receipt ? 'The approved USDC transfer was verified on Sepolia.' : 'A public test-USDC transfer. No real money.'}</p>
        <ol className="steps" aria-label="Checkout steps">{['Connect','Review','Pay'].map((step,index)=><li key={step} className={(index === 0 && !active || index === 1 && active && !approval || index === 2 && approval) ? 'selected' : ''}><span>{index + 1}</span>{step}</li>)}</ol>
        {!connection && <div className="notice"><strong>Checkout preview</strong><p>Wallet sign-in will be available once this app is connected to Privy.</p></div>}
        <div className="wallet-row"><div><span className="label">BUYER WALLET</span><strong>{active ? short(wallet.address) : 'Sign in with email'}</strong></div><button className="secondary" disabled={!connection || !connection.ready || busy || !!hash} onClick={() => { setApproval(null); setBlocked(false); active ? connection.logout() : connection.login(); }}>{active ? 'Disconnect' : connection?.authenticated ? 'Creating wallet…' : 'Connect wallet'}</button></div>
        {active && <details className="wallet-details"><summary>Wallet address & test funding</summary><code>{wallet.address}</code><p>Use this address for Sepolia test USDC and test ETH. Never send mainnet funds.</p><a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC ↗</a></details>}
        {!approval ? <form onSubmit={review}><label htmlFor="merchant">Merchant’s Ethereum address</label><input id="merchant" autoComplete="off" spellCheck="false" placeholder="0x…" value={recipient} onChange={e=>setRecipient(e.target.value)} required/><label htmlFor="amount">You’re paying</label><div className="amount-input"><input id="amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required/><span>USDC</span></div><small className="hint">Test limit: 10 USDC per payment · Network fees in test ETH</small><button className="primary" disabled={!active}>Review payment <span>→</span></button></form> : <div><div className="review"><span className="label">TOTAL TO MERCHANT</span><div className="total">{formatUnits(BigInt(approval.amountUnits),6)} <small>USDC</small></div><span className="label">APPROVED RECIPIENT</span><code>{approval.recipient}</code><div className="review-footer"><span>Ethereum Sepolia</span><span>Public transfer</span></div></div>
          {!hash && <><button className="primary" onClick={pay} disabled={busy || !active}>{busy ? 'Working…' : 'Approve & pay with Privy'}<span>→</span></button><button className="text-button" disabled={busy} onClick={()=>{setApproval(null);setBlocked(false);setMessage('');}}>Edit payment</button><button className="attack-button" disabled={busy} onClick={attack}>Test recipient-change protection</button></>}
          {blocked && <div className="notice protected" role="status"><strong>Changed recipient blocked.</strong><p>The proposed address differed from your approval. This was a local test; no transaction was submitted.</p></div>}
          {hash && <div className="receipt"><a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View transaction on Sepolia ↗</a>{!receipt && <button className="secondary" disabled={busy} onClick={recheck}>Recheck receipt</button>}{receipt && <><p>✓ Matching sender, recipient, token and amount.<br/>Verified after two confirmations.</p><button className="secondary" onClick={() => setView('receipts')}>View receipts</button><button className="secondary" onClick={()=>{setApproval(null);setHash('');setReceipt(null);setBlocked(false);setMessage('');}}>New payment</button></>}</div>}
        </div>}
        {message && <p className="status" role="status">{message}</p>}
        <div className="card-bottom"><span>Powered by Privy</span><span>Reviewed by you.</span></div>
      </section>}
    </main>
    <section className="architecture"><div><span className="eyebrow">ONE PRODUCT. TWO WALLET LAYERS.</span><h3>Easy to enter. Built toward privacy.</h3></div><p>Create your account and recoverable wallet inside Honeybee. Private wallet setup runs on the local test machine; the payment checkout currently sends public test transfers.</p><button className="text-button" aria-expanded={details} onClick={()=>setDetails(!details)}>How it works {details ? '−' : '+'}</button>{details && <div className="explanation"><p><strong>Today:</strong> this checkout sends public Sepolia USDC through Privy. Buyer approval checks run in the application; they are not independent onchain enforcement.</p><p><strong>Privacy integration:</strong> Your private wallet has separate keys and an encrypted backup. The local demo runtime handles those keys when you enter your recovery password. Privy sign-in alone cannot restore the private wallet.</p></div>}</section>
    <footer><span>honeybee pay</span><span>Made for people. Tested with care.</span><span>ETHOnline 2026</span></footer>
  </div>;
}
async function bootstrap() {
  let runtime;
  if (isLocalDemo(window.location.origin)) {
    try {
      const response = await fetch('/api/runtime', { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const config = await response.json();
        if (config.mode === 'local-testnet' && config.apiVersion === 1 && config.chainId === 11155111 && typeof config.appId === 'string') runtime = config;
      }
    } catch { /* Static preview and public checkout remain available. */ }
  }
  const appId = runtime?.appId || import.meta.env.VITE_PRIVY_APP_ID;
  createRoot(document.getElementById('root')).render(appId ? <PrivyProvider appId={appId} clientId={import.meta.env.VITE_PRIVY_CLIENT_ID || undefined} config={{ loginMethods: ['email'], defaultChain: sepolia, supportedChains: [sepolia], embeddedWallets: { ethereum: { createOnLogin: 'all-users' } }, appearance: { theme: 'light', accentColor: '#d4a321' } }}><ConnectedCheckout runtime={runtime}/></PrivyProvider> : <Checkout/>);
}
void bootstrap();
