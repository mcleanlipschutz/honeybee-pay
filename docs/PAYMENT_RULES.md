# Payment Rules

## Recipient

Payment can only go to the merchant wallet approved by the buyer.

## Amount

Each demo payment must be exactly 1 test USDC.

## Token

Payments using a different token must be rejected.

## Authorization

The buyer must approve each payment before it executes.

## Changes

Changing the recipient or amount requires new buyer approval.

## Duplicate payments

Each approval can only be used once.

## Expiration

Expired approvals must be rejected.

## Failed checks

If a required check fails, the protected payment must not proceed.

## AI permissions

AI can explain and propose payments but cannot override these rules.

## Unprotected comparison

The intentionally unprotected demo runs separately from the protected system.
