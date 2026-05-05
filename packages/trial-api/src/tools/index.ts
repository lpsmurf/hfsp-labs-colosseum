export { getSolPrice } from './sol-price.js';
export { getTokenPrice } from './token-price.js';
export { getWalletBalance } from './wallet-balance.js';
export { getRecentTxns } from './recent-txns.js';
export { checkTokenSafety } from './token-safety.js';

import { getSolPrice } from './sol-price.js';
import { getTokenPrice } from './token-price.js';
import { getWalletBalance } from './wallet-balance.js';
import { getRecentTxns } from './recent-txns.js';
import { checkTokenSafety } from './token-safety.js';

export const tools = {
  getSolPrice,
  getTokenPrice,
  getWalletBalance,
  getRecentTxns,
  checkTokenSafety,
};
