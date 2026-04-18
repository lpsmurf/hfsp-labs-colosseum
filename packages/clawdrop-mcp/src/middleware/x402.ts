  if (!req.clawdrop) {
    res.status(402).json({ error: message || 'Payment required' });
    return;
  }

  const response = {
    status: 'payment_required',
    error: message || 'Payment required to complete transaction',
    fee: {
      type: req.clawdrop.transaction_type || 'transfer',
      amount_sol: req.clawdrop.fee_sol || 0,
      amount_usd: req.clawdrop.fee_usd || 0,
      percent: req.clawdrop.fee_type || 'flat',
      clawdrop_wallet: req.clawdrop.clawdrop_wallet || '',
    },
    transaction: {
      type: req.clawdrop.transaction_type || 'transfer',
      confidence: req.clawdrop.transaction_confidence || 0,
    },
    payment_instructions: {
      send_to: req.clawdrop.clawdrop_wallet || '',
      amount: req.clawdrop.fee_sol || 0,
      memo: `[HFSP_${(req.clawdrop.transaction_type || 'transfer').toUpperCase()}_FEE]`,
    },
  };

  attachX402Headers(req, res);
  res.status(402).json(response);
}