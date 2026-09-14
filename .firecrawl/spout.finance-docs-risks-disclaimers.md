[Skip to content](https://spout.finance/docs/risks-disclaimers/#main)

HELP

# Risks and Disclaimers

Spout is a financial protocol. Using it involves real money and real risk. This section describes those risks plainly so you can make informed decisions.

### Smart Contract Risk

Spout's lending pool, collateral management, and settlement logic run on Solana smart contracts. While the protocol has been audited, no audit eliminates all risk. Smart contracts may contain undiscovered vulnerabilities. An exploit could result in loss of deposited funds. This risk exists in every onchain protocol and Spout is no exception.

### Market Risk

Borrowers are exposed to the price movement of their collateral. If the value of your locked collateral declines significantly, your position may be partially liquidated. Lenders are exposed to the performance of the options strategy: in rare extreme scenarios, cycle losses could exceed the Insurance Fund and Junior Tranche buffers and reach Senior principal.

### Oracle Risk

The protocol relies on external price feeds to determine collateral values, trigger liquidations, and settle options. If a price feed delivers an incorrect or delayed value, it could result in improper liquidation or missed liquidation. The protocol includes safeguards (staleness checks, deviation bounds, pause mechanisms) but these cannot eliminate oracle risk entirely.

### Liquidity Risk

Lender withdrawals depend on available liquidity in the reserve, from premium settlements, and from borrower repayments. In periods of high withdrawal demand or low repayment activity, withdrawals may be delayed. The FIFO queue and claim resale mechanisms exist to manage this, but instant liquidity is not guaranteed.

### Regulatory Risk

Tokenized securities and DeFi lending protocols operate in an evolving regulatory environment. Changes in regulation in any jurisdiction could affect the availability, legality, or tax treatment of Spout's products. Users are responsible for understanding the regulatory requirements in their own jurisdiction.

### Counterparty Risk

spAssets are backed by real shares held at a regulated US broker. If the broker were to become insolvent or unable to meet its obligations, the backing of spAssets could be affected. Shares held at the broker are subject to SIPC protection limits and the broker's own financial health.

### Stablecoin Risk

Lenders deposit stablecoins. Those stablecoins carry their own risk profile: issuer solvency, peg stability, and regulatory action against the issuer. This risk is identical to holding the same stablecoins anywhere else, but it is worth naming explicitly.

### Not Investment Advice

Nothing in these docs, in the app, or from the Spout team constitutes investment, financial, legal, or tax advice. Past performance of the options strategy, including any backtested results, does not guarantee future results. You should consult a qualified professional before making financial decisions. Use Spout at your own risk and only with capital you can afford to lose.