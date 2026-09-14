[Skip to content](https://spout.finance/docs/loss-waterfall/#main)

RISK MANAGEMENT

# The Loss Waterfall

If a cycle produces a net loss (because the cost of assignment exceeded the premium collected, or because of an extraordinary market event), the loss is absorbed in this order. No loss reaches the Senior Tranche unless the first two layers are fully exhausted.

1. 1.Insurance Fund (First-Loss). The protocol's own capital, absorbing losses from dollar one. Seeded at launch ($50k to $100k) and continuously funded from the 20% protocol fee on every cycle's premium. The fund targets 2% of total pool value; once it reaches that level, the contribution rate drops to a maintenance level. The protocol is first-loss from day one, before any lender capital is at risk.
2. 2.Junior Tranche (Second Layer). If a loss event exceeds the Insurance Fund, the Junior Tranche absorbs the remainder. This is the structural reason Junior earns a higher yield: compensation for bearing this second-loss position. At a $10m pool with 15% junior, the Junior Tranche provides an additional $1.5m of loss absorption before Senior capital is touched.
3. 3.Senior Tranche (Last Resort). Only if both the Insurance Fund and Junior Tranche are fully exhausted. Losses are socialized pro-rata across Senior depositors. In multi-year backtests across the full launch roster, the Insurance Fund alone absorbs the worst observed weekly outcomes with substantial headroom. A loss large enough to reach Senior has not occurred in any historical scenario we have tested.

Insurance Fund Stabilization. When the Insurance Fund exceeds its target level, the surplus can be used to top up the Senior Tranche's 7% priority yield in periods where raw premium falls short. This is not a guarantee; it is a self-funded buffer that activates only when the fund has built sufficient excess. The fund self-extinguishes at its target: it never skims from lender yield, only from protocol revenue.