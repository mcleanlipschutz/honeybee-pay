import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider, usePrivy, useWallets, useSendTransaction, useExportWallet } from '@privy-io/react-auth';
import { paymentChain } from './wallet-network.mjs';
import { MobileWallet } from './MobileWallet.jsx';
import { isLocalDemo } from './account-client.mjs';
import './style.css';
const Legacy = lazy(() => import('./LegacyCheckout.jsx').then(m => ({ default: m.LegacyCheckout })));
function Connected({ runtime, tools }) {
  const { ready, authenticated, login, logout, user, getAccessToken, error } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { exportWallet } = useExportWallet();
  const wallet = wallets.find(w => w.walletClientType === 'privy');
  const connection = { ready, walletsReady, authenticated, error, userId: user?.id, email: user?.email?.address, getAccessToken, wallet, login, logout, sendTransaction, exportWallet };
  const key = `${authenticated && user?.id || 'signed-out'}:${wallet?.address || ''}`;
  return tools ? <Suspense fallback={<p>Opening development tools…</p>}><Legacy key={key} runtime={runtime} connection={connection}/></Suspense> : <MobileWallet key={key} connection={connection} local={!!runtime}/>;
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
    } catch { /* Public mobile wallet also works without the local privacy runtime. */ }
  }
  const appId = runtime?.appId || import.meta.env.VITE_PRIVY_APP_ID;
  const tools = !!runtime && new URLSearchParams(location.search).get('tools') === '1';
  createRoot(document.getElementById('root')).render(appId ? <PrivyProvider appId={appId} clientId={import.meta.env.VITE_PRIVY_CLIENT_ID || undefined} config={{ loginMethods: ['email'], defaultChain: paymentChain, supportedChains: [paymentChain], embeddedWallets: { ethereum: { createOnLogin: 'all-users' } }, appearance: { theme: 'light', accentColor: '#e9b931' } }}><Connected runtime={runtime} tools={tools}/></PrivyProvider> : <MobileWallet/>);
}
void bootstrap();
