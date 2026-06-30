---
name: evm-targets
description: Registry of EVM chains, token addresses, and relayer endpoints supported by the bridge. Use to discover which destination chains and tokens are available and their identifiers. Use for "which chains are supported", "list EVM targets", "Polygon USDC address".
---

# evm-targets

Source of truth for supported destinations.

## Each entry
`{ chain, chainId, relayerEndpoint, tokens: { USDC: <address>, ... }, finalitySeconds }`

## MVP coverage
- polygon (Polymarket lives here — mandatory)
- gnosis (already live via gnosis-card-x402)
- base
- arbitrum (stretch)

Keep addresses canonical (USDC.e vs native USDC on Polygon — be explicit; Polymarket uses USDC.e).

Run `scripts/evm-targets.ts` to print the registry.
