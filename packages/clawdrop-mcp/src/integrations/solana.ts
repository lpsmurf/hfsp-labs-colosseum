// STREAM 4: Fallback RPC Endpoints (Kimi - Task 4.3)
// Fallback RPC endpoints for transaction verification

import axios from 'axios';
import { log } from '../utils/logger';

const RPC_TIMEOUT = 5000; // 5 seconds per RPC

interface RPCResponse {
  jsonrpc: string;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
  id: number;
}

/**
 * Verify payment transaction with fallback RPC endpoints
 * Tries: Primary -> Secondary -> Tertiary
 * Returns true if found on any RPC, false if all fail
 */
export async function verifyPaymentWithFallback(tx_hash: string): Promise<boolean> {
  const rpcs = [
    {
      name: 'Helius',
      url: process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    },
    {
      name: 'Mainnet Beta',
      url: 'https://api.mainnet-beta.solana.com',
    },
    {
      name: 'Project Serum',
      url: 'https://solana-api.projectserum.com',
    },
  ];

  for (const rpc of rpcs) {
    try {
      log.info(
        {
          tx_hash: tx_hash.substring(0, 10) + '...',
          rpc: rpc.name,
        },
        'Attempting payment verification on RPC'
      );

      const response = await axios.post<RPCResponse>(
        rpc.url,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            tx_hash,
            {
              encoding: 'json',
              maxSupportedTransactionVersion: 0,
            },
          ],
        },
        {
          timeout: RPC_TIMEOUT,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      // Check if transaction was found
      if (response.data.result) {
        log.info(
          {
            tx_hash: tx_hash.substring(0, 10) + '...',
            rpc: rpc.name,
            found: true,
          },
          'Transaction found on RPC'
        );
        return true;
      }

      // Check for RPC error
      if (response.data.error) {
        log.warn(
          {
            tx_hash: tx_hash.substring(0, 10) + '...',
            rpc: rpc.name,
            error_code: response.data.error.code,
            error_message: response.data.error.message,
          },
          'RPC returned error for transaction'
        );
      }
    } catch (error: any) {
      log.warn(
        {
          tx_hash: tx_hash.substring(0, 10) + '...',
          rpc: rpc.name,
          error: error.message,
          code: error.code,
        },
        'RPC request failed, trying next fallback'
      );
      // Continue to next RPC
    }
  }

  log.error(
    {
      tx_hash: tx_hash.substring(0, 10) + '...',
      rpcs_tried: rpcs.length,
    },
    'Transaction not found on any RPC'
  );

  return false;
}

/**
 * Get account information with fallback RPCs
 */
export async function getAccountInfoWithFallback(accountAddress: string): Promise<any | null> {
  const rpcs = [
    {
      name: 'Helius',
      url: process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    },
    {
      name: 'Mainnet Beta',
      url: 'https://api.mainnet-beta.solana.com',
    },
    {
      name: 'Project Serum',
      url: 'https://solana-api.projectserum.com',
    },
  ];

  for (const rpc of rpcs) {
    try {
      const response = await axios.post<RPCResponse>(
        rpc.url,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [accountAddress, { encoding: 'base64' }],
        },
        {
          timeout: RPC_TIMEOUT,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.result) {
        return response.data.result;
      }
    } catch (error: any) {
      log.warn(
        {
          account: accountAddress.substring(0, 10) + '...',
          rpc: rpc.name,
          error: error.message,
        },
        'RPC request failed for account info'
      );
    }
  }

  return null;
}
