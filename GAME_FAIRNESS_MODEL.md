# Game Fairness Model — SkyRush

## Outcome Function

```
h            = HMAC_SHA256(serverSeed, "sky-rush:" || roundNumber)
u            = int(h[0..12]) / 2^52                     # 52-bit uniform in [0,1)
crashPoint   = clamp( round2( (1 − houseEdge) / (1 − u) ), 1.01, 10000 )
houseEdge    = 0.03
```

Distribution: `P(crashPoint ≥ x) = 0.97 / x` for `x ≥ 1` — ~48.5% of rounds
reach 2×, ~9.7% reach 10×, with the 3% house edge realized as the difference
between the payout curve and true probabilities.

## Commit / Reveal Protocol

1. **Commit (before betting opens).** Server generates `serverSeed`
   (32 random bytes), publishes `serverSeedHash = SHA256(serverSeed)` on the
   `round:state` broadcast and stores it on the `GameRound` row. The hash binds
   the server to one specific outcome — it cannot be changed after bets open.
2. **Play.** The multiplier shown to players is `e^(0.05·t)` — a pure function
   of time. Its slope is identical every round; the crash *time* is the only
   secret. No curve metadata is broadcast (see "Removed leaks").
3. **Reveal (at settlement).** `serverSeed` is published on `round:settled` and
   persisted. Seeds rotate every 1000 rounds.
4. **Verify.** Anyone can recompute: check `SHA256(serverSeed) == serverSeedHash`,
   then re-derive the crash point and compare to the recorded outcome.
   `GET /api/admin/fairness/rounds` runs this automatically; the in-app
   verification is `FairnessService.verifyRound`.

## Independence Guarantees (structural)

The outcome function's complete input list is `(serverSeed, roundNumber)`.
There is no code path — parameter, global, or side-channel — through which any
of the following could affect a crash point:

- user identity, balance, reserved or available funds
- bet size, bet count, cashout behavior
- deposit volume, withdrawal volume, platform exposure
- previous rounds' results or house P&L
- number of players, total wagered this round

`DeterministicCrashPointProvider` exists only for tests. If constructed, the
engine skips commit/reveal (test-only mode); production always uses the
fairness service.

## Removed Leaks (found in audit)

1. `round:tick` used to broadcast `curveData` normalized by the crash point →
   observers could solve for the outcome mid-round. Removed from the wire.
2. The multiplier growth rate used to vary with `log(crashPoint)` → curve
   slope leaked outcome information. Now fixed at 0.05/s.

## Tests

`analytics.test.ts` → "Fairness — outcome independence": determinism,
per-round divergence, distribution bounds, commit/reveal round-trip,
tamper detection (seed mismatch, recorded-outcome tampering), and a
structural assertion that the derive function cannot even accept player-state
inputs.
