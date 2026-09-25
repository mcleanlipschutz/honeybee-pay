import React, { useState } from 'react';

// Hosted onboarding uses Privy's embedded wallet only. No local recovery API,
// recovery password, private-wallet seed or backup is exposed by this surface.
export function HostedWalletPanel({ connection }) {
  const [message, setMessage] = useState('');
  const signedIn = connection?.ready && connection.authenticated;
  const address = signedIn ? connection.wallet?.address : undefined;
  const copyAddress = async () => {
    try { await navigator.clipboard.writeText(address); setMessage('Wallet address copied.'); }
    catch { setMessage('Select the address below to copy it.'); }
  };
  return <section className="checkout wallet-panel hosted-wallet" aria-labelledby="wallet-heading">
    <div className="card-top"><span className="eyebrow">YOUR HONEYBEE WALLET</span><span className="pill">Testnet</span></div>
    <h2 id="wallet-heading">{address ? 'Your wallet is ready.' : signedIn ? 'Setting up your wallet…' : 'Your wallet starts here.'}</h2>
    <p className="subtext">Sign in with email to create a wallet inside Honeybee Pay. Use Sepolia test assets only.</p>
    <div className="wallet-row"><div><span className="label">HONEYBEE ACCOUNT</span><strong>{signedIn ? 'Signed in' : 'Email sign-in'}</strong></div>
      <button className={signedIn ? 'secondary' : 'primary'} disabled={!connection?.ready} onClick={() => signedIn ? connection.logout() : connection.login()}>{signedIn ? 'Sign out' : connection && !connection.ready ? 'Loading sign-in…' : 'Create account / sign in'}</button>
    </div>
    {!connection && <p className="notice">Sign-in is waiting for this app’s Privy configuration.</p>}
    {address && <div className="wallet-details"><span className="label">PUBLIC ETHEREUM WALLET</span><code>{address}</code><button className="secondary" onClick={copyAddress}>Copy address</button><p>Save this address to compare after signing out and back in. It should stay the same for the same account.</p><p>For a test payment, open “Public test checkout.” Do not send real funds.</p></div>}
    {signedIn && !address && <p className="status" role="status">Waiting for Privy to finish creating or loading your wallet. If this continues, sign out and try again.</p>}
    {message && <p className="status" role="status">{message}</p>}
    <div className="notice"><strong>Private payments are still in development.</strong><p>This wallet uses public blockchain addresses. Private-wallet setup, encrypted backup and recovery currently require the local app on a computer.</p></div>
    <p className="kyc-note">KYC is deferred for testing. Email sign-in does not verify your legal identity.</p>
    <div className="card-bottom"><span>Powered by Privy</span><span>Sepolia testnet only</span></div>
  </section>;
}
