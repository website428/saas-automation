-- Resend credentials belong in deployment/Edge Function secrets, never rows
-- readable by the application. Rotate any key previously stored here first.
ALTER TABLE domains DROP COLUMN IF EXISTS resend_api_key;

