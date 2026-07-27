---
title: x402 Protocol Implementation Guide
---

# x402 on Solana — Implementation Reference

## Standard flow
1. Client makes unauthenticated HTTP request
2. Server returns `402 Payment Required` with body:
   ```json
   { "pay": { "amount": 990000, "amountUsd": "0.99", "mint": "EPjFWdd5...", "payTo": "addr..." } }
   ```
3. Client sends SPL USDC transfer on Solana mainnet to `pay.payTo` for `pay.amount` (6 decimals)
4. Client retries original request with header: `X-Solana-Tx: <confirmed_signature>`
5. Server verifies tx on-chain via Helius RPC, returns `200` with resource

## USDC transfer (using @solana/web3.js v1 — migrate to Kit when possible)
- Program: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` (SPL Token)
- Mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Decimals: 6 (1 USDC = 1_000_000 lamports-equivalent)
- Instruction: `transfer` (or `transferChecked` for Token-2022 safety)

## Verification (server-side)
Server must verify via Helius or Solana RPC:
- `tx.meta.preTokenBalances` / `postTokenBalances` to confirm USDC delta
- Recipient ATA matches expected `payTo`
- Amount matches within tolerance
- Signature not previously used (replay protection — store used sigs)
- Transaction is confirmed (not just processed)

## Security checklist
- [ ] Verify USDC mint address (not just any SPL token)
- [ ] Check transaction finality (confirmed/finalized, not just processed)
- [ ] Store used signatures to prevent replay attacks
- [ ] Validate `payTo` ATA owner matches your wallet
- [ ] Set a payment expiry window (reject txs older than N minutes)
