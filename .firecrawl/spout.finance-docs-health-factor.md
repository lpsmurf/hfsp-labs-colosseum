[Skip to content](https://spout.finance/docs/health-factor/#main)

BORROWING

# The Health Factor

The Health Factor is the cushion between the current value of your collateral and the level at which the position would be liquidated. It is a function of three things: the market value of your collateral, your outstanding debt, and the liquidation threshold for the asset you posted (the LTV at which a position is partially liquidated).

Health Factor = (collateral value × liquidation threshold) ÷ debt. It equals 1.00 exactly when your debt reaches the liquidation threshold. Anything above 1.00 is safe, and the higher it is, the more market drawdown you can absorb before any action is needed.

Because the most you can borrow is 50% LTV and the liquidation threshold sits above that, every position opens above 1.00 from day one. That head start is the asset's liquidation buffer, and it is larger for more volatile collateral, so a steadier asset and a more volatile one at the same LTV do not carry the same Health Factor.

We surface the Health Factor on every position and notify you well in advance of any threshold being approached. There is no cost to being close to the line, and no cost to being far from it. The only thing that matters is collateral value relative to debt.