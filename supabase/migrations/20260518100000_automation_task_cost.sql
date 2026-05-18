-- Automation task per-row cost totals + per-phase keys on phase_outputs.
-- =============================================================================
-- Three new top-level fields on automation_tasks store the run's cumulative
-- totals so the UI can render a "Cost" column without re-aggregating the
-- phase_outputs JSONB on every read.
--
-- Per-phase breakdown lives inside phase_outputs[i] (JSONB array, no DDL needed).
-- The runner adds three optional keys to each entry at onPhaseEnd by snapshotting
-- the chat's cumulative usage from the agent API and recording the delta since
-- the previous phase:
--
--   phase_outputs = [{
--     phase_index, phase_position, phase_name, phase_model_id, content,
--     completed_at,
--     input_tokens?, output_tokens?, cost_usd?   <-- NEW
--   }, ...]
--
-- Old rows that ran before this lands carry no cost data — they'll show "—"
-- in the UI until re-run. No backfill, by design: re-running a row is the
-- cheap way to get the breakdown.
-- =============================================================================

ALTER TABLE public.automation_tasks
    ADD COLUMN IF NOT EXISTS total_input_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS total_output_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS total_cost_usd NUMERIC(12, 6);
