# Honeybee Pay mobile access

Published privately on September 10, 2026:

[Open Honeybee Pay](https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site)

## First phone test

1. In Privy, Configuration → App settings → Domains → Allowed origins, add `https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site`. Keep the app in development mode. For later local tests, also allow the exact local origin or use an app client.
2. Open the Honeybee link in Safari. This Site is owner-private; sign into the same ChatGPT account if prompted.
3. Tap Create account / sign in and complete Privy's email-code flow.
4. Confirm the embedded public-wallet address appears, copy it, sign out and sign back in. The same account should show the same address. These live actions still need testing.

## Implemented and checked

- Hosted email sign-in and Privy embedded public-wallet display, copy address and sign-out.
- Wallet/payment form appears first on phones; touch targets and input text enlarged.
- Seven checkout tests passed; production build and packaged assets passed checks.
- Public development App ID configured. Local P-256 public-key and runtime checks passed separately.
- The hosted bundle excludes backend configuration, wallet storage, seeds and recovery files.
- Private RAILGUN wallet creation, encrypted backup and recovery remain local. Private payments remain unimplemented. KYC stays deferred.
- The existing public Sepolia checkout is available; no funds were moved by this work. No live-login, native mobile interaction or payment test is claimed.

## Deployment and future updates

The first publish attempt timed out waiting for the managed HTTPS certificate. One retry of the same saved version succeeded. No additional Site or public access grant was created. Use the successful returned URL above; the original expected URL differed and is not the handoff URL.

The dedicated deployment source checkout is `/workspace/sites/honeybee-pay-mobile`, a snapshot of the GitHub repo's `checkout/` directory. Reuse `checkout/.openai/hosting.json` and this Site for future updates. Make application changes in the GitHub checkout first, refresh the deployment snapshot, then build/push/package that exact source. This status document is outside the deployed frontend source.

Deployment identifiers:

```json
{
  "project_id": "appgprj_6aa2b930b0b081919279d981ca83a815",
  "version_id": "appgprj_6aa2b930b0b081919279d981ca83a815~appgver_f81268638ef48191aacf6791989105a0",
  "version_number": 1,
  "source_commit": "506ab20c3cae6814ebcb2e00b2c2b3a811fe04ea",
  "first_attempt": {
    "env_set_revision": 0,
    "failure_message": "Timed out waiting for the TLS certificate for honeybee-pay-testnet.ckxjvsccbf.chatgpt.site",
    "id": "appgdep_6aa2ba753b1081918fba55ec00266717",
    "project_id": "appgprj_6aa2b930b0b081919279d981ca83a815",
    "provider_deployment_id": "site---6aa2b930b0b081919279d981ca83a815",
    "screenshot_asset_pointer": null,
    "status": "failed",
    "title": "Honeybee Pay",
    "type": "publish",
    "updated_at": "2026-09-10T14:23:07.030635+00:00",
    "url": null,
    "version_id": "appgprj_6aa2b930b0b081919279d981ca83a815~appgver_f81268638ef48191aacf6791989105a0"
  },
  "successful_retry": {
    "env_set_revision": 0,
    "failure_message": null,
    "id": "appgdep_6aa2bd64aad881918650c2af6c077d73",
    "project_id": "appgprj_6aa2b930b0b081919279d981ca83a815",
    "provider_deployment_id": "site---6aa2b930b0b081919279d981ca83a815",
    "screenshot_asset_pointer": "sediment://file_000000006eac81f5922ad6437dbd8145",
    "status": "succeeded",
    "title": "Honeybee Pay",
    "type": "publish",
    "updated_at": "2026-09-10T14:33:08.117317+00:00",
    "url": "https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site",
    "version_id": "appgprj_6aa2b930b0b081919279d981ca83a815~appgver_f81268638ef48191aacf6791989105a0"
  }
}
```

[Privy allowed-origin documentation](https://docs.privy.io/recipes/react/allowed-domains)
