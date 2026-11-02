# Security Policy

## Reporting a Vulnerability

This repository contains payment-handling code (x402 services, on-chain verification, wallet infrastructure). If you find a vulnerability, **do not open a public issue**.

**Preferred:** use [GitHub private vulnerability reporting](../../security/advisories/new) — it's enabled on this repo and creates a private advisory we can collaborate on.

**Alternatively:** email [info@hfsp.xyz](mailto:info@hfsp.xyz) with:

- Affected package/service and commit
- Reproduction steps or PoC
- Your assessment of impact

We aim to acknowledge reports within 72 hours and will coordinate disclosure timelines with you.

## Scope

In scope: anything under `packages/`, `config/`, `x402-audit/`, plus the live services backed by this code (`vpn.hfsp.cloud`, `store.hfsp.cloud`, `clawdrop.live`).

Out of scope: third-party dependencies (report upstream), social engineering, and findings requiring already-privileged access.

## Scope note on payment verification

x402 services verify transactions server-side via Helius RPC with replay protection. If you find a payment-bypass, replay, or signature-verification flaw, that's the highest-impact class — please include the chain (Solana/Base/Tron) and the endpoint.

## Safe harbor

Good-faith security research that follows this policy will not be pursued legally. Don't access or modify other users' data, don't degrade live services, and give us reasonable time to fix before public disclosure.
