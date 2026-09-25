import { checkPOIService } from './poi-preflight.mjs';
import { connectionErrorCode } from './rpc-transport.mjs';
import { syncFailureDiagnostic } from './sync-diagnostic.mjs';

try {
  console.log(JSON.stringify(await checkPOIService(process.env.HONEYBEE_POI_URL || 'https://ppoi.fdi.network')));
} catch (error) {
  const reason = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'TIMEOUT' : connectionErrorCode(error);
  console.error(JSON.stringify({ status: 'poi-service-unavailable', ...syncFailureDiagnostic('poi-service', reason), paymentReady: false }));
  process.exitCode = 1;
}
