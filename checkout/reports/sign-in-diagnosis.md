# Sign-in initialization diagnosis — September 14, 2026

The user reports the startup timeout on the public phone site. This remains an
unresolved real-device failure; the prior reload option was not a verified fix.

Verified locally:
- The production build contains the expected public Privy app ID.
- `usePrivy().ready` is independent of `useWallets().ready`.
- The installed SDK exposes initialization errors through `usePrivy().error`.
  Honeybee was discarding that field and displaying only a generic timeout.
- Native Sites error logs returned no relevant worker events. This does not
  establish that the user's browser successfully contacted Privy.
- Direct HTTP inspection of the site/provider from the execution environment was
  denied. Those responses are not evidence of a denial on the user's phone.

Changed: pass provider initialization errors to the screen, translate them to
fixed messages and support codes, and check secure-context/storage-read access.
No raw provider messages, tokens, emails, URLs or keys are displayed or collected.
Diagnostics do not clear storage, authenticate, change allowed origins or send money.

| Code | Meaning |
| --- | --- |
| HB-A01 | Browser reports an insecure context |
| HB-A02 | Browser storage read denied, or provider reports a storage/security error |
| HB-A03 | Provider reports an origin/domain/CORS error; confirm the cause in configuration/network logs |
| HB-A04 | Provider reports an app/client configuration error |
| HB-A05 | Provider reports a network/fetch/timeout error |
| HB-A06 | Other provider initialization error |
| HB-A07 | Startup timed out without a provider error; cause is still unknown |
| HB-A08 | Authenticated user, wallet loading timed out |

Next evidence: the phone's displayed support code and whether opening the exact
public site directly in Safari changes the result. If HB-A03 appears, inspect the
owner's Privy Domains/Clients settings for the exact Honeybee origin. Preserve
existing origins and user/wallet identity; do not disable origin restrictions or
substitute a new app ID to work around a rejection.

References checked: [Privy React setup](https://docs.privy.io/basics/react/setup),
[app clients](https://docs.privy.io/basics/get-started/dashboard/app-clients), and
[allowed domains](https://docs.privy.io/recipes/react/allowed-domains).

Validation: the 67-test suite passed; the updated four-test mobile-handler file
then passed with the added provider-error wiring test (68 distinct tests total).
Production build passed. No real email authentication, physical-camera use or
funded payment was performed. A diagnostic improvement is not successful login.
