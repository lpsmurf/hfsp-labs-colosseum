[Skip to content](https://spout.finance/docs/liquidation/#main)

BORROWING

# Liquidation

When the Health Factor drops below 1.00, the protocol starts a partial liquidation: it sells just enough collateral to pull the position back to a safe level, not a share more. The fee is not a flat number. It equals your asset's liquidation buffer, the gap between the 50% you borrowed at and the LTV where liquidation triggers, so it runs from roughly 4% on the steadiest collateral to about 12.5% on the most volatile. You pay in proportion to the risk your specific asset carries. The point is to keep the position alive through a drawdown, not to wipe it out at the first dip.