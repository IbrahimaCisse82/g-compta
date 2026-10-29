# Architecture rules

- Keep FEC serialization and pre-export validation in the pure `src/lib/fec-export.ts` module, with rule tests alongside it, so both UI and future asynchronous exports share the same controls.
- Read all exercise journal lines in bounded pages for FEC export instead of exporting the in-memory journal, because the data service limits individual responses.
- Compute asset gross, contra-account deductions and net through the shared accounting mapping, so screens, exports and reconciliation checks cannot use divergent calculations.