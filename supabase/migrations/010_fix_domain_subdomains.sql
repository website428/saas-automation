-- ═══════════════════════════════════════════════════════════════
-- Migration 010: Fix domain_name + from_email to use subdomains
-- ═══════════════════════════════════════════════════════════════
-- 
-- Problem: InvestorRaise is correctly stored as 'mail.investorraise.com'.
-- But FinModel and AIML are stored as root domains ('financialmodel.io',
-- 'aimlschool360.com'). Since reply_to is built as reply@domain_name,
-- replies land on the ROOT domain which conflicts with GoDaddy MX records.
--
-- Fix: Update domain_name + from_email to use subdomains — same pattern
-- as InvestorRaise. This means:
--   · reply@financialmodel.io  → reply@mail.financialmodel.io
--   · reply@aimlschool360.com  → reply@mail.aimlschool360.com
--
-- BEFORE running this:
-- 1. In Resend, add domain 'mail.financialmodel.io' if not already there
-- 2. In Resend, add domain 'mail.aimlschool360.com' if not already there
-- 3. Enable Receiving on both subdomains in Resend
-- 4. Add MX record to GoDaddy for each subdomain:
--      Type: MX | Host: mail | Value: inbound-smtp.resend.com | Priority: 10
-- ═══════════════════════════════════════════════════════════════

-- Update FinModel: root domain → subdomain
UPDATE domains
SET
  domain_name = 'mail.financialmodel.io',
  from_email  = 'prince@mail.financialmodel.io'
WHERE domain_name = 'financialmodel.io';

-- Update AIML School: root domain → subdomain
UPDATE domains
SET
  domain_name = 'mail.aimlschool360.com',
  from_email  = 'prince@mail.aimlschool360.com'
WHERE domain_name = 'aimlschool360.com';

-- Verify the final state of all three domains
SELECT domain_name, from_email, product_name, status
FROM domains
ORDER BY product_name;
