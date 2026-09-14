# Honeybee Pay — your checklist

Prepared September 14, 2026. These are the steps that need your phone, account access or personal decision. You do not need to write code or choose transaction fees.

## Before the Wave 1 deadline

- [ ] **Try the new wallet on your phone.** Open https://honeybee-pay-testnet.ckxjvsccbf.chatgpt.site and tap Continue with email. Enter your own verification code. Confirm that your wallet opens and the balance appears. Allow camera access when you choose Scan.
- [ ] **Confirm one small test payment on your phone.** Use only Sepolia test USDC and a little test ETH. Add money shows the address and free test-funding links. With a second test wallet, try a request QR/link, review the recipient and automatic fee, send once, and check Activity in both wallets. If a payment is pending, use Check status rather than sending again. Report any screen that is unclear. This is a device/authentication check I cannot complete in your place.
- [ ] **Review the prepared pitch, demo video and submission text.** They accurately call the live app a public test wallet and the Midnight result local contract simulation. The video is ready to upload; recording your voice is optional unless the portal specifically requires it.
- [ ] **Submit through your AKINDO account by September 16 at 15:00 UTC / 11:00 a.m. Eastern.** Confirm your personal eligibility and registered team details, attach the deck/video, paste the prepared text and exact Wave 1 source link, accept the required terms, then submit. Keep the confirmation. The event requires personal submission and prohibits automated entry tools. If it requests video/deck URLs, upload the prepared files through your account first.

## To unblock the next development segment

- [ ] **Provide a developer machine with Docker and access to a test-only Midnight wallet.** I still need to complete the compatible proving setup, real proofs, deployment and integration there. Keep seed phrases and recovery passwords on your device; do not paste them into chat.
- [ ] **Decide whether Honeybee should cover users' network fees.** Automatic fee calculation is already implemented. Removing the need to obtain test ETH also requires sponsorship. If you want Honeybee to pay, approve/configure a gas-sponsorship budget in the Privy account. I will then wire and validate the complete sponsored-payment and recovery flow before enabling it. No paid sponsorship has been activated here.

## Optional personal backup

- [ ] Open your account menu > Wallet backup and save a private backup through the secure wallet dialog. Only you should view the key. Do not share it in chat or a screen recording.

## Already handled for you

The mobile interface, email-login readiness fix, wallet balance, receive address, camera/QR-image scanning, payment links, automatic fee review, single-click send flow, confirmed history and interrupted-payment recovery are implemented. Technical documentation is in GitHub. The Midnight contract compiles, its request adapter works in simulation, and automated checks have been run. The pitch deck, recorded-output demo video and submission description are prepared. The PR has the `midnightntwrk` label.

## Work that remains mine

Real Midnight proofs and deployment, private-state recovery, connecting the mobile flow to the approval contract, payment settlement integration, sponsorship implementation after account setup, and production/multi-asset support are still engineering work. The current app is a mobile web prototype for public Sepolia test USDC. It is not yet a native app, real-money wallet or completed private payment product.
