[Skip to content](https://spout.finance/docs/options-assignment/#main)

BORROWING

# Option Assignment

Because locked collateral backs covered calls written by the protocol, there is always some chance in a given cycle that the calls finish in the money and the shares are sold at the strike. When that happens for your collateral, here is what occurs:

The shares are sold at the strike. The proceeds first cover any outstanding debt you have. The remainder is yours.

If Auto-Roll is on (the default), the residual proceeds are automatically used to rebuy the same asset and re-enroll it in the next cycle, restoring your position. If Auto-Roll is off, the residual settles to you in stablecoins and the position closes out cleanly.

Most users leave Auto-Roll on. The whole point of using Spout is that the productive cycle keeps running in the background; turning Auto-Roll off is for users who want a single-cycle exit window.