# Module 4 — Circuit breaker / response layer

**Status: PIPELINE. Not built, and mostly not an engineering problem.**

What you would need to build this, honestly ordered: the hard requirements come
first and none of the top four are code.

---

## The engineering is the easy 20%

A circuit breaker is, mechanically, not difficult:

```
alert (from Module 3) ──► policy engine ──► pause authority ──► bridge halts
                               │
                               └──► quorum request (out-of-band) ──► release
```

A policy engine mapping alert severity to action, a signing path that can submit
a pause instruction, an out-of-band confirmation flow, an audit log. Weeks, not
months.

Everything that makes it hard is upstream of the code.

---

## 1. Authority you do not have *(blocking)*

To pause peg-outs you must **be** the bridge operator, or hold a power the
federation has explicitly delegated to you.

There is no version of this we can ship unilaterally. The customer has to install
software and grant it the ability to stop their own money movement. That is not
a procurement decision, it is a governance change — for a federated bridge,
plausibly a vote among members who have never heard of us.

**What we would need:** a named operator who has asked for this in writing, with
the governance path to delegate the authority already identified. Without that
there is nothing to build against.

## 2. Independence from the transaction path *(design-critical)*

If the same nodes that validate and process transactions also control the pause,
an attacker who compromises those nodes can block the pause. **The brake cannot
be wired to the engine.**

Requirements this imposes:

- Separate infrastructure, separate credentials, separate operators from the
  transaction-processing fleet.
- The pause must be **fail-safe, not fail-open**: if the breaker loses contact
  with the bridge, the correct default is to halt, not to continue.
- The pause authority key needs HSM or threshold custody, with a quorum that does
  not overlap the peg-out signing quorum. Overlapping quorums mean one compromise
  gets both.

## 3. It must be automatic, and that is the uncomfortable part *(design-critical)*

The reference drain completed in **~28 minutes**. Any design where an alert wakes
a human who then decides is already too slow. **Monitoring without automated
response would not have prevented this incident** — which means the breaker has
to be allowed to halt a production bridge with no human in the loop.

That inverts the usual risk conversation. The question stops being "will it catch
the attack" and becomes **"what does a false positive cost, and who is liable?"**
An auto-pause on a legitimate large withdrawal is a customer-facing outage on a
financial system. Nobody will grant that authority to a vendor without:

- A measured false-positive rate from a long shadow-mode run (see 6).
- Contractual liability allocation for a wrongful halt.
- A documented, fast, multi-party override to resume.

## 4. Liability and legal *(blocking, and not ours to solve)*

Software that can halt a nine-figure reserve carries real exposure both ways:
halting wrongly, and failing to halt. This needs insurance, a liability cap, and
counsel before a single line is written. Realistically the operator's own legal
team drives this and we are a subcontractor to it.

## 5. Out-of-band quorum channel *(engineering, but subtle)*

For transactions over the concentration threshold, require confirmation from a
quorum of federation members **through a channel independent of the chain and of
the bridge software** — so a compromise of the bridge cannot forge the approval.

Non-obvious requirements:

- Independent identity for each member, not bridge-derived keys.
- Must work when members are asleep and across time zones, or the threshold is
  theatre.
- Approvals must be replay-proof and scoped to one specific transaction, or an
  approval captured once is reusable.

## 6. Shadow mode, for a long time *(prerequisite to trust)*

The breaker must run for months in a mode where it **logs the decision it would
have made and takes no action.** This is the only way to produce the
false-positive number that item 3 requires, and no operator should enable
enforcement without it.

Budget realistically: 3–6 months of shadow operation on live traffic before
anyone turns it on.

## 7. Idempotent, reversible, testable pause *(engineering)*

- Pausing twice must be safe; the alert may fire repeatedly.
- Resume must be a distinct, separately-authorised action — never automatic on
  alert clearance.
- Regular game-day drills, because an untested kill switch is an assumption.
- In-flight operations at the moment of pause need defined semantics: queued,
  rejected, or held. Getting this wrong turns a safety mechanism into a stuck-funds
  incident.

---

## Bottom line

Ranked by what actually blocks us:

| # | Requirement | Type | Blocking? |
|---|---|---|---|
| 1 | Operator authority + governance delegation | Business/legal | **Yes** |
| 2 | Liability allocation and insurance | Legal | **Yes** |
| 3 | Infrastructure independent of the tx path | Design | Yes, if built |
| 4 | Accepted automatic action + FP budget | Business | **Yes** |
| 5 | Out-of-band quorum channel | Engineering | No |
| 6 | 3–6 months shadow mode | Operational | Yes, before enforcement |
| 7 | Idempotent/reversible pause + drills | Engineering | No |

**Four of the seven are not engineering, and all four of those are blocking.**

Recommendation: do not start Module 4 speculatively. It is only reachable through
an operator relationship that begins with something smaller — which is the
argument for the reconciliation dashboard in
[module-3-bridge-monitor.md](module-3-bridge-monitor.md) §5. Build the thing that
earns the conversation first; a circuit breaker is what you get to sell in year
three, not year one.
