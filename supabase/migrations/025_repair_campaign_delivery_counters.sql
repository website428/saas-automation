-- Repair historical counters that were inflated when both the sender and the
-- delivery webhook incremented sent_count. Queue status is the source of truth.
UPDATE campaigns AS campaign
SET
  sent_count = (
    SELECT COUNT(*)::int
    FROM email_queue AS queue
    WHERE queue.campaign_id = campaign.id
      AND queue.status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained')
  ),
  opened_count = (
    SELECT COUNT(*)::int
    FROM email_queue AS queue
    WHERE queue.campaign_id = campaign.id
      AND queue.status IN ('opened', 'clicked')
  ),
  clicked_count = (
    SELECT COUNT(*)::int
    FROM email_queue AS queue
    WHERE queue.campaign_id = campaign.id
      AND queue.status = 'clicked'
  ),
  bounced_count = (
    SELECT COUNT(*)::int
    FROM email_queue AS queue
    WHERE queue.campaign_id = campaign.id
      AND queue.status = 'bounced'
  );
