-- REVIEW ONLY. NOT EXECUTED. Draft fail-closed protection policy.
-- The user has instructed: NO raw-data cleanup of ANY kind until BOTH:
-- (1) independent permanent evidence archive built, filled, reconciled, tested,
--     backed up and a restore test passed; AND
-- (2) Tayla's written approval identifies the fields that may be retained.
-- After both: still requires a NEW explicit owner approval before any cleanup.
-- NEVER delete whole flight_jobs records. Proposed protection against both
-- manual SQL and scheduled jobs; not protection from a DB superuser disabling DDL.
-- Install only after assessing effects on existing capture/scoring transactions.

CREATE SCHEMA IF NOT EXISTS evidence_v1;

CREATE FUNCTION evidence_v1.block_campaign_deletion()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'DATA_HOLD: full flight/capture/track row deletion prohibited; archive and legal review required';
END; $$;
CREATE TRIGGER protect_flight_jobs_from_delete
BEFORE DELETE ON public.flight_jobs
FOR EACH ROW EXECUTE FUNCTION evidence_v1.block_campaign_deletion();
CREATE TRIGGER protect_flight_captures_from_delete
BEFORE DELETE ON public.flight_captures
FOR EACH ROW EXECUTE FUNCTION evidence_v1.block_campaign_deletion();
CREATE TRIGGER protect_postflight_tracks_from_delete
BEFORE DELETE ON public.postflight_tracks
FOR EACH ROW EXECUTE FUNCTION evidence_v1.block_campaign_deletion();

-- Always reject a change that removes or alters stored raw Capture JSON until
-- a SECOND owner-approved migration introduces a field-by-field cleanup rule.
-- This is intentionally stronger than a cutoff date and has no bypass switch.
CREATE FUNCTION evidence_v1.block_raw_capture_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.raw_capture IS DISTINCT FROM NEW.raw_capture THEN
  RAISE EXCEPTION 'DATA_HOLD: raw_capture change blocked pending archived and tested evidence plus Tayla approval and owner approval';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_raw_capture_from_update
BEFORE UPDATE OF raw_capture ON public.flight_captures
FOR EACH ROW EXECUTE FUNCTION evidence_v1.block_raw_capture_change();

-- In production, this protection would be reviewed alongside column-level
-- retention for OTHER provider-origin data, backups, log storage and tables.
-- It is not a full compliance solution or an activated control today.
