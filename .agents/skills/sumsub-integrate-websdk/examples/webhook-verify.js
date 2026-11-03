// Sumsub webhook receiver — signature verification on RAW bytes.
//
// Why raw bytes: Sumsub's digest covers the exact wire payload. Re-serialising
// after JSON.parse will reorder keys / collapse whitespace and break the match.
//
// Mount as POST /webhooks/sumsub. Use express.raw() (NOT express.json()).

import crypto from 'node:crypto';
import express from 'express';

const ALG_MAP = {
  HMAC_SHA1_HEX:   'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
};

const SUMSUB_WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET;
if (!SUMSUB_WEBHOOK_SECRET) throw new Error('SUMSUB_WEBHOOK_SECRET not set');

export function verifySumsubWebhook(rawBody, headers) {
  const algName = headers['x-payload-digest-alg'] || 'HMAC_SHA256_HEX';
  const alg = ALG_MAP[algName];
  if (!alg) return { ok: false, reason: `unknown algorithm: ${algName}` };

  const expectedHex = headers['x-payload-digest'];
  if (!expectedHex) return { ok: false, reason: 'missing x-payload-digest header' };

  const actualHex = crypto.createHmac(alg, SUMSUB_WEBHOOK_SECRET).update(rawBody).digest('hex');

  const actualBuf   = Buffer.from(actualHex,   'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return { ok: false, reason: 'length mismatch' };
  if (!crypto.timingSafeEqual(actualBuf, expectedBuf)) return { ok: false, reason: 'digest mismatch' };

  return { ok: true };
}

export const router = express.Router();

router.post(
  '/webhooks/sumsub',
  express.raw({ type: 'application/json' }),     // req.body is a Buffer
  (req, res) => {
    const result = verifySumsubWebhook(req.body, req.headers);
    if (!result.ok) {
      console.warn('sumsub webhook rejected:', result.reason);
      return res.status(401).send('invalid signature');
    }

    // Safe to parse now that the digest is verified. Guard against malformed JSON.
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch (err) {
      console.warn('sumsub webhook: invalid json payload', err);
      return res.status(400).send('invalid json');
    }

    // Simple idempotency gate: dedupe by applicantId|type|createdAtMs.
    // Replace with DB-backed insert-on-duplicate-ignore semantics in production.
    const idParts = [
      event.applicantId || event.externalUserId || '',
      event.type || '',
      event.createdAtMs || event.timestamp || '',
    ];
    // If every identifying field is missing, the key would degenerate to "::"
    // and unrelated events would dedupe against each other — skip the gate.
    if (idParts.every((p) => p === '')) {
      console.warn('sumsub webhook: no identifying fields, skipping dedupe');
      handleEvent(event).catch((err) => console.error('handler error', err));
      return res.status(200).end();
    }
    const idKey = idParts.join('::');
    if (!global.__sumsub_seen_events) global.__sumsub_seen_events = new Map();
    const seen = global.__sumsub_seen_events;
    if (seen.has(idKey)) {
      console.debug('sumsub webhook duplicate, ignoring', idKey);
      return res.status(200).end();
    }
    seen.set(idKey, true);
    // Keep dedupe entry for 1 hour.
    setTimeout(() => seen.delete(idKey), 1000 * 60 * 60);

    handleEvent(event).catch((err) => console.error('handler error', err));

    // Respond 2xx ASAP so Sumsub does not retry.
    res.status(200).end();
  },
);

async function handleEvent(event) {
  switch (event.type) {
    case 'applicantCreated':
      // First mint of a token for externalUserId. Nothing required.
      break;

    case 'applicantPending':
    case 'applicantPrechecked':
      // Show "in review" in the UI; do not gate access yet.
      break;

    case 'applicantOnHold':
      // Notify ops. Tell user "additional checks in progress".
      break;

    case 'applicantReviewed': {
      // THIS IS THE TRUTH. Update DB.
      const { reviewAnswer, reviewRejectType, rejectLabels = [] } = event.reviewResult || {};
      if (reviewAnswer === 'GREEN') {
        await markUserVerified(event.externalUserId);
      } else if (reviewAnswer === 'RED') {
        await markUserRejected(event.externalUserId, {
          finalNoRetry: reviewRejectType === 'FINAL',
          labels: rejectLabels,
        });
      } else {
        // Unexpected/null/other reviewAnswer — log and skip automatic rejection.
        console.warn('sumsub webhook applicantReviewed with unexpected reviewAnswer:', reviewAnswer, event);
      }
      break;
    }

    case 'applicantPersonalInfoChanged':
      // User edited info after submission — re-check before granting access.
      break;

    case 'applicantWorkflowCompleted':
      // Multi-level workflow finished. Same handling as applicantReviewed
      // for single-level flows.
      break;

    default:
      // Unhandled event type — log and move on.
      console.debug('sumsub unhandled event', event.type, event.applicantId);
  }
}

// --- Replace with your DB writes ------------------------------------------

async function markUserVerified(externalUserId) {
  // e.g. UPDATE users SET kyc_status = 'verified', kyc_verified_at = now()
  //      WHERE id = $1;
}

async function markUserRejected(externalUserId, { finalNoRetry, labels }) {
  // e.g. UPDATE users SET kyc_status = 'rejected',
  //                       kyc_can_retry = NOT $2,
  //                       kyc_reject_labels = $3
  //      WHERE id = $1;
}
