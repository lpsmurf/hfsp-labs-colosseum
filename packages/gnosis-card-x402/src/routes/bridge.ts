/**
 * /api/bridge — bidirectional USDC bridge API
 *
 * POST /api/bridge/quote   — get fee quote (both directions)
 * POST /api/bridge/submit  — submit order (both directions)
 * GET  /api/bridge/status/:orderId — poll Relay.link status
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getQuote, createAndSubmitOrder, getOrderStatus } from '../services/bridge.js';
import { config, GNOSIS_CHAIN_ID, SOLANA_CHAIN_ID, GNOSIS_TOKENS, USDC_MINT } from '../config.js';
import { ethers } from 'ethers';

export const bridgeRouter = Router();

const GNOSIS_RPC = 'https://rpc.gnosischain.com';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RelayEvmTxData {
  to: string; data: string; value: string; chainId: number;
  gas?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string;
}

interface RelayStep {
  id: string;
  items: Array<{ status: string; data: RelayEvmTxData; check?: { endpoint: string } }>;
}

async function getGnosisToSolQuote(opts: {
  amountRaw: string;
  solanaAddress: string;
}): Promise<{ steps: RelayStep[]; orderId: string }> {
  const res = await fetch(`${config.RELAY_API_URL}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user:               config.EVM_WALLET_ADDRESS,
      originChainId:      GNOSIS_CHAIN_ID,
      destinationChainId: SOLANA_CHAIN_ID,
      originCurrency:     GNOSIS_TOKENS.USDC,
      destinationCurrency: USDC_MINT,
      amount:             opts.amountRaw,
      recipient:          opts.solanaAddress,
      tradeType:          'EXACT_INPUT',
    }),
  });
  if (!res.ok) throw new Error(`Relay.link quote failed: ${await res.text()}`);
  const data = await res.json() as { steps: RelayStep[]; protocol?: { v2?: { orderId?: string } }; details?: { currencyOut?: { amountFormatted?: string }; timeEstimate?: number }; fees?: { relayerService?: { amountFormatted?: string }; relayerGas?: { amountFormatted?: string } } };
  const checkEndpoint = data.steps[0]?.items[0]?.check?.endpoint ?? '';
  const match = checkEndpoint.match(/requestId=([^&]+)/);
  return { steps: data.steps as RelayStep[], orderId: match?.[1] ?? data.protocol?.v2?.orderId ?? '' };
}

async function executeEvmStep(step: RelayStep, signer: ethers.Wallet, provider: ethers.JsonRpcProvider): Promise<string> {
  const tx = step.items[0].data;
  const sent = await signer.connect(provider).sendTransaction({
    to:      tx.to,
    data:    tx.data,
    value:   BigInt(tx.value ?? '0'),
    chainId: GNOSIS_CHAIN_ID,
    ...(tx.gas ? { gasLimit: BigInt(tx.gas) } : {}),
  });
  const receipt = await sent.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error(`EVM tx failed: ${sent.hash}`);
  return sent.hash;
}

// ── Quote ─────────────────────────────────────────────────────────────────────

bridgeRouter.post('/quote', async (req: Request, res: Response) => {
  const { direction, amountUsdc, safeAddress, solanaAddress, dstToken = 'USDC' } = req.body as {
    direction: 'sol_to_gnosis' | 'gnosis_to_sol';
    amountUsdc: number;
    safeAddress?: string;
    solanaAddress?: string;
    dstToken?: string;
  };

  if (!direction || !amountUsdc || amountUsdc <= 0) {
    res.status(400).json({ error: 'direction and amountUsdc are required' }); return;
  }

  try {
    if (direction === 'sol_to_gnosis') {
      if (!safeAddress) { res.status(400).json({ error: 'safeAddress required' }); return; }
      const quote = await getQuote({
        srcAmountUsdc: amountUsdc, dstToken: dstToken as 'USDC' | 'EURe' | 'GBPe',
        safeAddress, sourceChain: 'solana',
      });
      res.json({
        srcAmountUsdc:       quote.srcAmountUsdc,
        dstAmountFormatted:  quote.dstAmountFormatted,
        bridgeFeeUsdc:       quote.bridgeFeeUsdc,
        estimatedFillTimeMs: quote.estimatedFillTimeMs,
        depositAddress:      config.WALLET_PUBLIC_KEY,
      });

    } else {
      if (!solanaAddress) { res.status(400).json({ error: 'solanaAddress required' }); return; }
      const feePct    = parseFloat(config.TOPUP_FEE_PCT) / 100;
      const bridgeAmt = amountUsdc * (1 - feePct);
      const amountRaw = Math.round(bridgeAmt * 1_000_000).toString();

      // Fetch full quote to get accurate output amount and fees
      const res2 = await fetch(`${config.RELAY_API_URL}/quote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: config.EVM_WALLET_ADDRESS, originChainId: GNOSIS_CHAIN_ID,
          destinationChainId: SOLANA_CHAIN_ID, originCurrency: GNOSIS_TOKENS.USDC,
          destinationCurrency: USDC_MINT, amount: amountRaw,
          recipient: solanaAddress, tradeType: 'EXACT_INPUT',
        }),
      });
      if (!res2.ok) { res.status(502).json({ error: `Relay quote failed: ${await res2.text()}` }); return; }
      const data = await res2.json() as { fees?: { relayerService?: { amountFormatted?: string }; relayerGas?: { amountFormatted?: string } }; details?: { currencyOut?: { amountFormatted?: string }; timeEstimate?: number } };
      const relayFee = parseFloat(data.fees?.relayerService?.amountFormatted ?? '0');
      const gasFee   = parseFloat(data.fees?.relayerGas?.amountFormatted ?? '0');
      res.json({
        srcAmountUsdc:       amountUsdc,
        dstAmountFormatted:  parseFloat(data.details?.currencyOut?.amountFormatted ?? '0'),
        bridgeFeeUsdc:       parseFloat((relayFee + gasFee + amountUsdc * feePct).toFixed(6)),
        estimatedFillTimeMs: (data.details?.timeEstimate ?? 10) * 1000,
        depositAddress:      config.EVM_WALLET_ADDRESS,  // user sends Gnosis USDC here
      });
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Submit ────────────────────────────────────────────────────────────────────

bridgeRouter.post('/submit', async (req: Request, res: Response) => {
  const { direction, amountUsdc, safeAddress, solanaAddress, srcTxSignature, gnosisTxHash } = req.body as {
    direction: 'sol_to_gnosis' | 'gnosis_to_sol';
    amountUsdc: number;
    safeAddress?: string;
    solanaAddress?: string;
    srcTxSignature?: string;
    gnosisTxHash?: string;
  };

  try {
    if (direction === 'sol_to_gnosis') {
      if (!safeAddress || !srcTxSignature) {
        res.status(400).json({ error: 'safeAddress and srcTxSignature required' }); return;
      }
      const order = await createAndSubmitOrder({ srcAmountUsdc: amountUsdc, dstToken: 'USDC', safeAddress, sourceChain: 'solana' });
      res.json(order);

    } else {
      if (!solanaAddress || !gnosisTxHash) {
        res.status(400).json({ error: 'solanaAddress and gnosisTxHash required' }); return;
      }

      // 1. Verify user's Gnosis payment tx
      const gnosisProvider = new ethers.JsonRpcProvider(GNOSIS_RPC);
      const receipt = await gnosisProvider.getTransactionReceipt(gnosisTxHash);
      if (!receipt || receipt.status !== 1) {
        res.status(400).json({ error: 'Gnosis transaction not confirmed' }); return;
      }

      // 1b. Check bridge wallet has xDAI for gas
      const gasBalance = await gnosisProvider.getBalance(config.EVM_WALLET_ADDRESS);
      if (gasBalance < BigInt(10_000_000_000_000_000)) { // < 0.01 xDAI
        res.status(503).json({
          error: 'Bridge wallet has insufficient xDAI for gas. Please contact support or try again shortly.',
          hint: `Fund ${config.EVM_WALLET_ADDRESS} with ≥0.05 xDAI on Gnosis Chain`,
        }); return;
      }

      // 2. Get fresh Relay.link quote (approve + deposit steps)
      const feePct    = parseFloat(config.TOPUP_FEE_PCT) / 100;
      const bridgeAmt = amountUsdc * (1 - feePct);
      const amountRaw = Math.round(bridgeAmt * 1_000_000).toString();

      const { steps, orderId: relayOrderId } = await getGnosisToSolQuote({ amountRaw, solanaAddress });

      const evmWallet = new ethers.Wallet(config.EVM_WALLET_PRIVATE_KEY);

      // 3. Execute approve step (ERC-20 allowance for Relay.link contract)
      const approveStep = steps.find(s => s.id === 'approve');
      if (approveStep?.items[0]) {
        console.log('[bridge] executing approve step…');
        await executeEvmStep(approveStep, evmWallet, gnosisProvider);
      }

      // 4. Execute deposit step (actual bridge tx)
      const depositStep = steps.find(s => s.id === 'deposit');
      if (!depositStep?.items[0]) {
        res.status(502).json({ error: 'Relay.link returned no deposit step' }); return;
      }
      console.log('[bridge] executing deposit step…');
      const bridgeTxHash = await executeEvmStep(depositStep, evmWallet, gnosisProvider);

      // 5. Derive orderId for polling
      const checkEndpoint = depositStep.items[0].check?.endpoint ?? '';
      const match = checkEndpoint.match(/requestId=([^&]+)/);
      const orderId = match?.[1] ?? relayOrderId ?? bridgeTxHash;

      res.json({ orderId, status: 'pending', srcTxHash: bridgeTxHash, createdAt: Date.now() });
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Status ────────────────────────────────────────────────────────────────────

bridgeRouter.get('/status/:orderId', async (req: Request, res: Response) => {
  try {
    const status = await getOrderStatus(req.params.orderId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
