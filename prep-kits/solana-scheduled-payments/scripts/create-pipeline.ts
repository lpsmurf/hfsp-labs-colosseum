// usage: tsx scripts/create-pipeline.ts (define pipeline in code/args)
// TODO(devin): POST pipeline def to Multihopper `POST /api/v1/transfers` with headers
//   `x-api-key` and a fresh `Idempotency-Key` (UUID, required on every POST — MH_070 if missing); return transferId.
// Docs: https://dev-docs.multihopper.com/guides/agentic-integration
throw new Error("TODO: implement Multihopper create-pipeline");
