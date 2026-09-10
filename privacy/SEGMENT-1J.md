# Segment 1J: approved POI validation and sync deadline

The user approved sending disposable-wallet transaction/address-derived requests
to `https://ppoi.fdi.network`. That approval remains applicable.

The approved 90-second run passed deployment verification and provider loading,
completed UTXO history and was still updating TXID history at its deadline. It
did not establish completed synchronization.

`HONEYBEE_SYNC_TIMEOUT_SECONDS` now accepts 30–600 whole seconds (default 90).
A five-minute run was attempted to allow the remaining history validation:

```sh
HONEYBEE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com HONEYBEE_SYNC_TIMEOUT_SECONDS=300 npm run wallet:sync -- .honeybee/demo
```

Automatic approval review rejected that run because it separately required
authorization for potential wallet-related queries to the public RPC endpoint.
No further full-sync run followed that rejection. Before resuming, the remaining
external destinations are the RPC above and the existing history service at
`https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql`.

An approved POI transport comparison found Axios's HTTP adapter failed with
`ERR_BAD_RESPONSE`; its fetch adapter returned HTTP 200 and validated TXID index
3709. The CLI now selects the supported Axios fetch adapter only for the exact
configured POI endpoint, limits requests to 15 seconds and rejects redirects.
Other Axios requests retain their adapters. JSON request and response handling
and all POI validation rules remain intact.

Validation results are in `reports/segment-1j-validation.json`. Full synchronization
and spendable balances remain unverified. No funding or broadcasts occurred.
