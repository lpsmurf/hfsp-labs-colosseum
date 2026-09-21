import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';

// ─────────────────────────────────────────────────────────────────────────────
// x402 / payment-protocol deep checks.
//
// These encode the payment-and-webhook lenses from the ECC production-audit
// skill (signature-before-parse, idempotency, replay) specialised for x402
// services. They complement static/payment.ts (which catches presence-only
// header bypass) by looking for the subtler settlement bugs.
// ─────────────────────────────────────────────────────────────────────────────

const SKIP = /node_modules|\.lock$|package-lock\.json|\.min\./;
const SERVER_EXT = /\.(ts|js|mjs|cjs)$/;

export function runX402Checks(file: RepoFile): Finding[] {
  const findings: Finding[] = [];
  const { path, content } = file;

  if (SKIP.test(path) || !SERVER_EXT.test(path)) return findings;
  if (/\.(test|spec)\.|\.d\.ts$/.test(path)) return findings;

  const lower = content.toLowerCase();
  const looksPaymentRelated =
    /x-payment|x402|webhook|settle|facilitator|payment-required|paymentrequired/i.test(content);
  if (!looksPaymentRelated) return findings;

  // 1. Parse-before-verify: req.body is JSON-parsed/destructured before any
  //    signature verification. Classic webhook-forgery vector.
  const hasRawBodyVerify = /verify\w*\([^)]*req\.(?:rawBody|body)|createHmac[\s\S]{0,200}req\.(?:rawBody|body)/i.test(content);
  const parsesBody = /JSON\.parse\s*\(\s*req\.body|const\s*\{[^}]+\}\s*=\s*req\.body/i.test(content);
  const verifiesSig = /(?:verifySignature|verifyWebhook|createHmac|timingSafeEqual|x-payload-digest|signature)/i.test(content);
  if (parsesBody && verifiesSig && !hasRawBodyVerify) {
    findings.push({
      id:       'X402-WEBHOOK-001',
      severity: 'HIGH',
      title:    'Webhook body parsed before signature verification',
      detail:   `\`${path}\` appears to parse req.body and also verify a signature, but the signature is not computed over the raw body. Verifying a re-serialized body (or verifying after parse) lets an attacker forge events.`,
      location: path,
      fix:      'Capture the raw request bytes (e.g. express.raw()) and compute the HMAC over those exact bytes BEFORE JSON.parse. Use crypto.timingSafeEqual for the comparison.',
    });
  }

  // 2. Replay / idempotency: payment is verified but there is no nonce / seen /
  //    idempotency store, so the same tx or webhook can be replayed.
  // Require an actual settlement/verify *call* — not a mere mention of the word
  // (which fired on config.ts / errors.ts / openapi.ts that just import types).
  const verifiesPayment = /(?:verif(?:y|ies)(?:Payment|Tx|Transaction)|settlePayment|processPayment|\.settle|facilitator\.(?:verify|settle))\s*\(/i.test(content);
  const hasReplayGuard  = /replay|idempoten|nonce|already.?(?:used|seen|processed)|seen\.(?:has|add)|claim\(/i.test(content);
  if (verifiesPayment && !hasReplayGuard) {
    findings.push({
      id:       'X402-REPLAY-001',
      severity: 'HIGH',
      title:    'No replay / idempotency protection around payment settlement',
      detail:   `\`${path}\` verifies a payment but shows no replay guard (nonce, idempotency key, or a "seen transaction" store). The same signed payment or webhook can be submitted repeatedly to unlock content or double-fulfill.`,
      location: path,
      fix:      'Record each settled tx signature / payment id in a persistent store and reject duplicates atomically (claim-before-verify). Make fulfillment idempotent.',
    });
  }

  // 3. Amount not validated: settlement happens without comparing the paid
  //    amount to the required amount.
  const settles = /settle|markPaid|grantAccess|fulfil|deliver|return\s+(?:protected|content)/i.test(content);
  const checksAmount = /amount\s*(?:>=|>|===|==|<|\.gte|\.gt)|maxAmountRequired|requiredAmount|expectedAmount/i.test(content);
  if ((verifiesPayment || settles) && !checksAmount && /amount/i.test(content)) {
    findings.push({
      id:       'X402-AMOUNT-001',
      severity: 'MEDIUM',
      title:    'Payment amount may not be validated against the required price',
      detail:   `\`${path}\` handles payment/settlement and references an amount but contains no comparison against a required/expected amount. An underpayment (e.g. 1 micro-USDC) could unlock full-price content.`,
      location: path,
      fix:      'Assert the on-chain settled amount ≥ the required price (and the correct asset/mint) before granting access. Reject otherwise with 402.',
    });
  }

  // 4. Network/asset confusion: accepts a payment without checking which chain
  //    or token it settled on.
  const multiNetwork = /(base|solana|eip155|mainnet)/i.test(content) && /accepts\s*[:=]\s*\[/i.test(content);
  const checksNetworkAndAsset = /network\s*(?:===|==|\.includes|\.startsWith)/i.test(content) && /(?:asset|mint)\s*(?:===|==|\.toLowerCase)/i.test(content);
  if (multiNetwork && verifiesPayment && !checksNetworkAndAsset) {
    findings.push({
      id:       'X402-NETWORK-001',
      severity: 'MEDIUM',
      title:    'Payment network/asset may not be validated on settlement',
      detail:   `\`${path}\` advertises multiple payment networks but does not appear to verify the settled transaction's network AND asset (mint) on acceptance. A payment in a worthless token or on the wrong chain could be accepted.`,
      location: path,
      fix:      'On verification, confirm BOTH the network and the asset/mint match one of the advertised `accepts[]` entries before settling.',
    });
  }

  // 5. x402 version not pinned — spec divergence we already documented in the
  //    ecosystem sweep (x402-v1-v2-spec-divergence.md).
  if (/x402Version/i.test(content) && !/x402Version\s*[:=]\s*[12]\b/.test(content) && !lower.includes('x402version === ')) {
    findings.push({
      id:       'X402-VERSION-001',
      severity: 'LOW',
      title:    'x402 protocol version not explicitly pinned',
      detail:   `\`${path}\` references x402Version but does not pin it to a concrete value (1 or 2). Spec divergence between v1 and v2 challenge bodies causes client incompatibility.`,
      location: path,
      fix:      'Emit and validate an explicit x402Version (2 for the current spec). See the x402 v1/v2 divergence finding in x402-audit/findings.',
    });
  }

  return findings;
}
