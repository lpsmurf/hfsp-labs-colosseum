export { getSolPrice } from './sol-price.js';
export { getTokenPrice } from './token-price.js';
export { getWalletBalance } from './wallet-balance.js';
export { getRecentTxns } from './recent-txns.js';
export { checkTokenSafety } from './token-safety.js';

export { getTokenByAddress } from './dexscreener.js';
export { getJupiterPrice, getJupiterTokenByTicker, getJupiterQuote } from './jupiter.js';
export { getNetworkTPS } from './network.js';
export { getAllTokenBalances } from './token-balances.js';
export { parseTransaction } from './parse-tx.js';
export { getMagicEdenCollectionStats, getMagicEdenPopularCollections, getMagicEdenListings } from './magic-eden.js';
export { getNFTAsset, searchNFTAssets } from './nft-asset.js';
export { resolveSolDomain, getWalletDomain, getAllDomainTLDs } from './domains.js';
export { getAlloraTopics, getAlloraInference } from './allora.js';
export { searchSolanaEcosystem } from './solana-ecosystem.js';

import { getSolPrice } from './sol-price.js';
import { getTokenPrice } from './token-price.js';
import { getWalletBalance } from './wallet-balance.js';
import { getRecentTxns } from './recent-txns.js';
import { checkTokenSafety } from './token-safety.js';

import { getTokenByAddress } from './dexscreener.js';
import { getJupiterPrice, getJupiterTokenByTicker, getJupiterQuote } from './jupiter.js';
import { getNetworkTPS } from './network.js';
import { getAllTokenBalances } from './token-balances.js';
import { parseTransaction } from './parse-tx.js';
import { getMagicEdenCollectionStats, getMagicEdenPopularCollections, getMagicEdenListings } from './magic-eden.js';
import { getNFTAsset, searchNFTAssets } from './nft-asset.js';
import { resolveSolDomain, getWalletDomain, getAllDomainTLDs } from './domains.js';
import { getAlloraTopics, getAlloraInference } from './allora.js';
import { searchSolanaEcosystem } from './solana-ecosystem.js';

export const tools = {
  getSolPrice,
  getTokenPrice,
  getWalletBalance,
  getRecentTxns,
  checkTokenSafety,
  // New tools
  getTokenByAddress,
  getJupiterPrice,
  getJupiterTokenByTicker,
  getJupiterQuote,
  getNetworkTPS,
  getAllTokenBalances,
  parseTransaction,
  getMagicEdenCollectionStats,
  getMagicEdenPopularCollections,
  getMagicEdenListings,
  getNFTAsset,
  searchNFTAssets,
  resolveSolDomain,
  getWalletDomain,
  getAllDomainTLDs,
  getAlloraTopics,
  getAlloraInference,
  searchSolanaEcosystem,
};
