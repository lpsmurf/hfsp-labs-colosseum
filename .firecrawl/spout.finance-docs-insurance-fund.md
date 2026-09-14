[Skip to content](https://spout.finance/docs/insurance-fund/#main)

RISK MANAGEMENT

# Insurance Fund: How It Works

The Insurance Fund is not a marketing feature. It is a defined, rules-based reserve with transparent mechanics.

### Funding

The fund is seeded at launch and continuously replenished from the 20% protocol fee. A fixed portion of every cycle's protocol fee flows into the fund until it reaches its target level of 2% of total pool value. At a $10m pool, that target is $200,000. Once the target is met, contributions drop to a maintenance rate that covers normal drawdowns.

### Drawdown triggers

The fund is drawn when a cycle produces a net loss (assignment cost exceeds premium collected for that cycle). The drawdown is automatic: the loss is debited from the fund before any lender tranche is affected. If multiple assets produce losses in the same week, each is drawn independently.

### Replenishment

After a drawdown, the contribution rate from protocol fees increases until the fund is restored to its target level. During replenishment, protocol revenue is lower but lender distributions are unaffected. The fund recovers from protocol income, not from lender yield.

### Transparency

The current fund balance, target level, contribution rate, and drawdown history are visible in the app. There is no discretionary access to the fund. It operates under fixed rules that cannot be changed without governance action.