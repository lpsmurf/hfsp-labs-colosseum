[Skip to content](https://spout.finance/docs/security-and-compliance/#main)

SECURITY & COMPLIANCE

# Security & Compliance

### Proof of Reserve

Every spAsset is backed 1:1 by shares custodied at a regulated US broker. The backing is attested onchain via Proof of Reserve and verifiable at any time. You do not have to take our word for the existence of the underlying; the math is on the chain.

### KYC at the Token Level

spAssets use Solana's Token-2022 standard with a transfer hook that enforces wallet-level KYC. Tokens cannot move to non-verified wallets. This is what makes a regulated equity-backed model possible onchain at all.

### Regulatory Registration

Spout Finance Inc. is registered with the U.S. Financial Crimes Enforcement Network (FinCEN) as a Money Services Business (MSB) under the Bank Secrecy Act. Registration reflects our compliance obligations for anti-money-laundering (AML) and know-your-customer (KYC) programs; it is not an endorsement or approval of Spout by FinCEN or any government agency.

### Custody

Shares are held with a regulated US broker. Options execution flows through the same regulated venue. The protocol engine never holds custody of the underlying.

Operational hygiene. Engine deploys are blue/green and never happen during market hours or on a cycle entry day. Every external order uses idempotency keys so retries cannot duplicate fills. Broker state and onchain state reconcile continuously.