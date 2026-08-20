-- ═══════════════════════════════════════════════════════════════
-- Migration 004: All RPC Functions (consolidated, no duplicates)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Domain sent counter
CREATE OR REPLACE FUNCTION increment_domain_sent(did uuid) RETURNS void AS $$
  UPDATE domains SET emails_sent_today = emails_sent_today + 1 WHERE id = did;
$$ LANGUAGE SQL;

-- Campaign counters
CREATE OR REPLACE FUNCTION increment_campaign_sent(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION increment_campaign_opened(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET opened_count = opened_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION increment_campaign_clicked(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET clicked_count = clicked_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION increment_campaign_bounced(cid uuid) RETURNS void AS $$
  UPDATE campaigns SET bounced_count = bounced_count + 1 WHERE id = cid;
$$ LANGUAGE SQL;

-- Email template variant usage (for balanced rotation)
CREATE OR REPLACE FUNCTION increment_template_count(tid uuid) RETURNS void AS $$
  UPDATE email_templates SET send_count = send_count + 1 WHERE id = tid;
$$ LANGUAGE SQL;
