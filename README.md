[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Bungsuu11jore7/token-radar-05/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Bungsuu11jore7/token-radar-05/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Risk-Adjusted Token Radar — radar-5

Pre-token protocols ranked by fitted launch value. Every number comes from the
sealed snapshot at runtime; no protocol names are hardcoded.

## Model

- **Implied value:** `log10(mcap) = 3.025 + 0.522 · log10(TVL)`, OLS fitted on the
  snapshot's own 128 traded protocols. The program recomputes the coefficients
  from the snapshot on every run and asserts them.
- **Held-out (honest):** 2-fold R² 0.14 / 0.22, median error 0.51 / 0.55 dex;
  walk-forward R² 0.02; leave-one-out R² 0.17 — all beating a flat multiple on
  the same splits. Age, 7-day growth, category, quadratic, Huber and trimmed
  forms were tested and dropped: none beat the TVL-only line out of sample.
- **Token odds:** share of same-age peers that record a token (under 90 days 4%,
  90–365 days 10%, 1–2 years 12%, 2–4 years 22%, over 4 years 28%).
- **Expected value:** implied × odds; the board ranks 340 pre-token protocols by
  it (40/40 watchlist covered, 758 protocols accounted for).
- **Farm plans:** 5 costed steps per protocol — gas by chain, working capital,
  weeks, breakeven share — with a Farm / Thin / Skip verdict.

## Dashboard

Sortable board, top-signals ladder, pre-token / live-anchor tabs (the fit checked
against the 144 traded protocols), detail tabs (Overview / Farm plan / Model),
compare, a what-if sandbox that reprices a row with the fitted line, chain
filter, pins, and a methodology section that shows every test, including the
terms that failed.

Referral: `6wtj6288`
