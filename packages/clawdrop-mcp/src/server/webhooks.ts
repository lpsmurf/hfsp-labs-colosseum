/**
 * Webhook Routes
 * 
 * Phase 4 Webhook Receiver
 * POST /webhooks/payment-confirmed - Receive payment confirmations
 * With HMAC signature verification and idempotency
 */

import { Router } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import * as phase4Store from '../db/phase4-store';
import { provisionAfterPayment } from './openrouter';

const router = Router();

/**
 * Verify webhook HMAC signature
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch (error) {
    logger.error({ error }, 'Webhook signature verification failed');
    return false;
  }
}

/**
 * Validate webhook timestamp (reject > 5 minutes old)
 */
function isTimestampValid(timestamp: string): boolean {
  try {
    const eventTime = new Date(timestamp).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    return (now - eventTime) < fiveMinutes;
  } catch {
    return false;
  }
}

/**
 * POST /webhooks/payment-confirmed
 * Receive and process payment confirmation webhooks
 */
router.post('/payment-confirmed', async (req, res) => {
  try {
    // Get webhook secret
    const secret = process.env.WEBHOOK_HMAC_SECRET;
    if (!secret) {
      logger.error('WEBHOOK_HMAC_SECRET not configured');
      return res.status(500).json({
        error: 'Server Configuration Error',
        message: 'Webhook secret not configured'
      });
    }

    // Get signature from header
    const signature = req.headers['x-webhook-signature'] as string;
    if (!signature) {
      logger.warn('Missing webhook signature');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing X-Webhook-Signature header'
      });
    }

    // Verify signature
    const payload = JSON.stringify(req.body);
    const isValid = verifyWebhookSignature(payload, signature, secret);
    
    if (!isValid) {
      logger.warn('Invalid webhook signature');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid signature'
      });
    }

    // Parse payload
    const {
      eventId,
      timestamp,
      userId,
      transactionHash,
      inputToken,
      inputAmount,
      herdAmount,
    } = req.body;

    // Validate required fields
    if (!eventId || !userId || !transactionHash) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: eventId, userId, transactionHash'
      });
    }

    // Check idempotency
    if (phase4Store.isWebhookProcessed(eventId)) {
      logger.info({ eventId }, 'Duplicate webhook, already processed');
      return res.json({
        status: 'already_processed',
        message: 'Event already handled'
      });
    }

    // Validate timestamp
    if (!isTimestampValid(timestamp)) {
      logger.warn({ eventId, timestamp }, 'Webhook timestamp too old');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Event timestamp too old (> 5 minutes)'
      });
    }

    // Record webhook event
    phase4Store.createWebhookEvent({
      eventId,
      type: 'payment-confirmed',
      userId,
      payload: req.body,
      processed: false,
    });

    logger.info({
      eventId,
      userId,
      transactionHash,
      input: `${inputAmount} ${inputToken}`,
      output: `${herdAmount} HERD`,
    }, 'Processing payment confirmation');

    // Create or update transaction
    const existingTx = phase4Store.getTransactionByHash(transactionHash);
    
    if (existingTx) {
      // Update existing transaction
      phase4Store.updateTransaction(existingTx.id, {
        status: 'confirmed',
        confirmedAt: new Date(),
      });
    } else {
      // Create new transaction
      phase4Store.createTransaction({
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        transactionHash,
        inputToken: inputToken || 'SOL',
        inputAmount: inputAmount || 0,
        herdAmount: herdAmount || 0,
        status: 'confirmed',
        confirmedAt: new Date(),
      });
    }

    // Mark webhook as processed
    phase4Store.updateWebhookEvent(eventId, {
      processed: true,
      processedAt: new Date(),
    });

    // TODO: Week 2 - Trigger OpenRouter provisioning asynchronously
    // This provisions API access after successful payment
    provisionAfterPayment(userId, herdAmount).then(result => {
      if (result.success) {
        logger.info({ userId, keyId: result.keyId }, 'OpenRouter auto-provisioned after payment');
      } else {
        logger.error({ userId, error: result.error }, 'OpenRouter auto-provisioning failed');
      }
    }).catch(err => {
      logger.error({ userId, error: err }, 'OpenRouter provisioning error');
    });

    logger.info({ eventId }, 'Webhook processed successfully');

    res.json({
      status: 'received',
      processing: true,
      eventId,
    });
  } catch (error) {
    logger.error({ error, body: req.body }, 'Webhook processing error');
    
    // Record error if we have eventId
    if (req.body?.eventId) {
      phase4Store.updateWebhookEvent(req.body.eventId, {
        processed: true,
        processedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Webhook processing failed'
    });
  }
});

/**
 * GET /webhooks/status/:eventId
 * Check webhook processing status
 */
router.get('/status/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = phase4Store.getWebhookEvent(eventId);
    
    if (!event) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Webhook event not found'
      });
    }

    res.json({
      eventId: event.eventId,
      type: event.type,
      processed: event.processed,
      processedAt: event.processedAt,
      error: event.error,
      createdAt: event.createdAt,
    });
  } catch (error) {
    logger.error({ error, eventId: req.params.eventId }, 'Webhook status check failed');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check webhook status'
    });
  }
});

export default router;
