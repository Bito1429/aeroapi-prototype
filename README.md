# Generic flight engine v2.3
Persistent production dispatcher with pre-cohort terminal-state hardening.

Mandatory clock: INITIAL within T-120..T-60, then T-60/T-30/T-15/T-10.
Due work: one six-row atomic claim per invocation, bounded concurrency=6, 3-minute stale lease recovery.
Postflight: first check from scheduled arrival +15m; retry every 15m until actual_on plus terminated track. Hard stop at scheduled_on_initial +6h => POSTFLIGHT_UNAVAILABLE.
Cancellation before actual_out => CANCELLED. Cancellation/irregular noncompletion after actual_out => IRREGULAR_NONCOMPLETION.
Destination frozen on job registration/INITIAL target and compared against realized postflight destination; mismatch => DIVERTED, non-scoreable.
Only SCOREABLE terminal state may proceed to normal Method-A scoring.
First accepted complete AeroAPI track is persisted immutably; later retrievals do not overwrite it.
