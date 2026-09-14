[Skip to content](https://spout.finance/docs/lending-tranches/#main)

LENDING

# Lending Tranches

The lending pool is divided into two tranches. Think of it like a building with two floors: the Senior Tranche sits on top, insulated from the ground, while the Junior Tranche is the ground floor that absorbs any flooding first.

- Senior Tranche (85% of pool). Designed for lenders who want a stable, predictable return with minimal risk exposure. Senior receives a 7% priority yield, meaning it gets paid first out of every settlement before any residual flows elsewhere. On top of that, it earns a 25% share of any yield above the 7% floor, so in strong periods it participates in the upside without taking on first-loss risk.



In a $10m pool, the Senior Tranche holds $8.5m and targets roughly 9% net APY.

- Junior Tranche (15% of pool). Designed for lenders who want higher returns and are comfortable taking on the first-loss position below the Insurance Fund. After the Senior 7% priority is paid, Junior receives all remaining yield. In normal market conditions, this produces returns of roughly 32% APY.



The tradeoff is straightforward: if losses exceed the Insurance Fund, Junior absorbs them before Senior is touched. Junior also requires a 45-day notice period for withdrawals, reflecting its role as a structural buffer for the pool.


Why this structure? Without tranching, every lender shares the same risk and return. That works, but it forces risk-averse capital and risk-seeking capital into the same bucket. Tranching lets each type of lender pick the position that matches their appetite. Senior gets the stability. Junior gets the leverage. The protocol gets a structurally deeper liquidity base because both sides are served.

## How the Tranching Math Works

To make the tranche structure concrete, here is a simplified walkthrough of how a single week's premium flows through the pool.

Assume a $10m lending pool: $8.5m Senior (85%) and $1.5m Junior (15%). In a given week, the protocol collects $30,000 in gross options premium across all active collateral positions.

1. 1.Protocol fee. The protocol takes its 20% fee: $6,000. This funds operations and seeds the Insurance Fund.
2. 2.Insurance Fund contribution. A portion of the protocol fee flows into the Insurance Fund until it reaches its target level (2% of pool value, or $200,000 in this example). Once the fund is fully capitalized, the contribution rate drops to maintenance.
3. 3.Senior priority yield. Senior receives its 7% annualized priority first. On $8.5m, that works out to roughly $11,400 per week ($8.5m x 7% / 52). This comes off the top of the remaining $24,000 in net premium.
4. 4.Excess yield split. After Senior's priority is paid, $12,600 remains. Senior receives 25% of this excess ($3,150) and Junior receives the remaining 75% ($9,450).
5. 5.Final tally. Senior earned $14,550 on $8.5m for the week, which annualizes to roughly 8.9%. Junior earned $9,450 on $1.5m, which annualizes to roughly 32.8%. In weeks where gross premium is higher (during elevated volatility, for example), the excess pool grows and Junior's share scales accordingly.

This is the core of the structure: Senior always gets its 7% priority first, creating predictable income. Junior absorbs the variability but captures the upside when premiums are rich. Neither tranche subsidizes the other. The math is the same every week; only the gross premium input changes.