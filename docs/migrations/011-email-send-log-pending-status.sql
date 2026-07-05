-- Migration 011: allow a 'pending' status so sendReportEmail can claim a row
-- BEFORE calling Resend (not after), closing a check-then-act race where two
-- concurrent calls (a double-click, or an automatic send racing a manual resend)
-- could both pass the old check and both actually send.
ALTER TABLE email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
ALTER TABLE email_send_log ADD CONSTRAINT email_send_log_status_check
  CHECK (status IN ('pending', 'sent', 'failed'));
