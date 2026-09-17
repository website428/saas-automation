# Marketing and sales control center

The `/dashboard/marketing` page is the sales layer on top of the existing contact, campaign, AI-personalization, queue, Resend, analytics, and inbox features.

## Local and production setup

1. Copy `.env.example` to `.env.local` and fill in the existing Supabase, Resend, and AI values.
2. Set `MARKETING_WEBHOOK_SECRET` to a long random value in `.env.local` and in the deployment environment. Never commit the value.
3. Run the existing Supabase migrations before using contact, campaign, or queue actions.
4. Run `supabase/migrations/017_finmodel_pro_automation.sql` after the existing migrations.
5. Start the app with `npm run dev`, or build and run it with `npm run build` and `npm run start`.

## Vercel deployment

This repository is prepared for Vercel. Import the repository as a Next.js project; the checked-in `vercel.json` uses `npm run build` and registers the daily reset and lifecycle cron jobs. Add the environment variables from `.env.example` in Vercel under both Preview and Production as appropriate, then redeploy after changing variables because Vercel applies environment-variable changes to new deployments.

Set `NEXT_PUBLIC_APP_URL` and `APP_BASE_URL` to the final HTTPS Vercel/custom-domain URL, for example `https://app.finmodelpro.com`. Set `CRON_SECRET`; Vercel sends it as `Authorization: Bearer <CRON_SECRET>` when invoking cron routes, and the cron handlers verify that header. Vercel cron schedules use UTC; the checked-in schedules are midnight UTC for daily reset and 03:00 UTC for lifecycle checks.

Keep the Supabase Edge Functions `process-queue`, `process-webhook`, and `resend-inbound` deployed. They remain the email delivery worker and inbound mail processor because the queue worker can run longer than a short web request and must preserve the existing pacing and quota controls. Vercel hosts the landing page, dashboard, `/api/leads`, Meta webhook, Razorpay webhook, product-event API, and lifecycle cron. Do not add a five-minute queue cron on Vercel Hobby; Hobby cron jobs are limited to once per day. If you later move the queue worker into Vercel, use a Pro plan and first refactor the sender to use the server-side service-role path and a short, idempotent batch.

## FinModel Pro automation connections

The automation control page is `/dashboard/automation`. Enter the `MARKETING_WEBHOOK_SECRET` in memory to load campaign rules, then assign active campaigns to lifecycle events. The secret is required for both reading and saving rules because these settings control email sending.

## Meta ads landing-page flow

The public FinModel Pro landing page is `/`. Point your Meta website-conversion ads to the deployed home URL and add UTM parameters, for example:

```text
https://YOUR_DOMAIN/?utm_source=meta&utm_medium=paid_social&utm_campaign=finmodel-growth
```

The page includes the hero, feature proof, pricing, FAQ, responsive lead form, and a CTA that uses `NEXT_PUBLIC_PRODUCT_SIGNUP_URL` when configured. The lead form posts to `POST /api/leads`, stores the lead in `contacts`, preserves an existing unsubscribe status, and adds the UTM values as CRM tags. It never accepts a campaign ID or email delay from a public browser request.

Set `NEXT_PUBLIC_META_PIXEL_ID` to enable PageView, ViewContent, and Lead events for Meta reporting. If your product already has a real signup/trial URL, set `NEXT_PUBLIC_PRODUCT_SIGNUP_URL` to that URL before deploying. For website-conversion ads, set `PUBLIC_LEAD_AUTOMATION_ENABLED=true` only after the `lead_created` rule has a real active campaign; the server will then send the fixed `lead_created` event through the same automation processor. The existing Meta Lead Ads webhook remains the fully automated path for native Meta instant forms: Meta sends the lead to `/api/webhooks/meta`, the verified adapter creates/updates the contact, and `/dashboard/automation` applies the configured campaign rule.

Configure these webhook URLs in your external services:

```text
Meta Lead Ads: https://YOUR_DOMAIN/api/webhooks/meta
Razorpay:      https://YOUR_DOMAIN/api/webhooks/razorpay
Product events: https://YOUR_DOMAIN/api/marketing/events
Lifecycle cron: https://YOUR_DOMAIN/api/cron/marketing-automation
```

Meta requires `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, and `META_ACCESS_TOKEN`. Razorpay requires `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and a separate `RAZORPAY_WEBHOOK_SECRET`. The lifecycle cron requires `CRON_SECRET` and should be called at least daily by Vercel Cron, Supabase Cron, or another trusted scheduler.

The Meta adapter verifies Meta's signature, retrieves the lead from Graph API, deduplicates it, and converts it to `lead_created`. The Razorpay adapter verifies the raw-body HMAC signature, deduplicates using Razorpay's event ID, and converts captured payments, paid orders, subscription activation/charges, payment failures, halted subscriptions, cancellations, pauses, and refunds into lifecycle events. It can fetch missing customer email details through the Razorpay API when credentials are configured. Both adapters use the same contact and queue logic as the product event API.

The supported product lifecycle events include `lead_created`, `trial_started`, `integration_connected`, `model_generated`, `aha_reached`, `activated`, `demo_booked`, `trial_day_11`, `trial_day_13`, `trial_expired`, `paid`, `refunded`, `invoice_failed`, `subscription_cancelled`, and `churned`.

In Razorpay Dashboard, configure the webhook URL `https://YOUR_DOMAIN/api/webhooks/razorpay` under Account & Settings → Webhooks. Use a dedicated webhook secret; it is not the same as the Razorpay key secret. Subscribe to `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.paused`, `subscription.resumed`, and `subscription.updated` as applicable to your billing model.

## Product event automation

The authenticated endpoint is:

```text
POST /api/marketing/events
```

Every request must include either `x-marketing-secret: <MARKETING_WEBHOOK_SECRET>` or `Authorization: Bearer <MARKETING_WEBHOOK_SECRET>`. The endpoint is intentionally disabled when the secret is missing.

Example request:

```bash
curl -X POST https://your-domain.example/api/marketing/events \
  -H "content-type: application/json" \
  -H "x-marketing-secret: YOUR_SECRET" \
  -d '{
    "email": "founder@example.com",
    "event": "trial_started",
    "name": "Asha Rao",
    "company_name": "Northstar Labs",
    "job_title": "Founder",
    "source": "product",
    "campaign_id": "ACTIVE_CAMPAIGN_UUID"
  }'
```

Supported events are `lead_created`, `trial_started`, `activated`, `paid`, `demo_booked`, `email_clicked`, and `churned`. The event updates or creates the contact, adds event/source/stage tags, and preserves an unsubscribed status. If `campaign_id` is supplied, the campaign must be active and the contact is enrolled into step 1 of the existing email queue. Duplicate enrollments are skipped.

Omit `campaign_id` when the event should update the CRM only. This is useful for product analytics events that should not send email.

## Recommended operating loop

- Capture a lead with `lead_created`.
- Enroll the lead into a campaign only after the contact has consent and the campaign is active.
- Send `trial_started` and `activated` events from the product to keep lifecycle tags current.
- Review Hot leads in the control center, open the lead brief, and qualify or stage the contact.
- Use the Sales pipeline to see every lifecycle stage at a glance.
- Filter the lead list, choose a destination stage, and use Bulk pipeline action to move the current filtered view together.
- Copy or create reusable outreach templates. The studio replaces placeholders with safe generic values; use the lead brief for lead-specific copy.
- Use Event automation builder to generate a ready-to-adapt `fetch` snippet for each product event and optionally attach an active campaign.
- Use the content queue and weekly checklist to keep the non-email acquisition work moving.
- Export the current lead view as CSV for a handoff or a backup.

## Growth integrations added in migration 028

Run `supabase/migrations/028_sales_integrations_and_attribution.sql` after migration 027. It adds Calendly booking identifiers/times, payment attribution fields, and indexes used by Ads & Attribution.

### Calendly

Set `CALENDLY_WEBHOOK_SIGNING_KEY` in Vercel and configure a Calendly webhook for:

```text
https://YOUR_DOMAIN/api/webhooks/calendly
```

Subscribe to `invitee.created` and `invitee.canceled`. A created meeting marks the contact as `audit_booked`, stores a confirmed booking, cancels queued nurture messages, creates a meeting-preparation task, and processes the `demo_booked` automation event. A cancellation is recorded in the sales activity timeline.

### Meta Ads attribution

Set `META_AD_ACCOUNT_ID` and `META_ADS_ACCESS_TOKEN` in Vercel. Open **Ads & Attribution** in the dashboard and enter the same admin secret used by Growth. The report reads Meta campaign spend/traffic and joins it with contacts captured through Meta campaign IDs or matching website UTM campaign names.

### Optional GA4

Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` in Vercel to load GA4 on the application and public landing pages. Leave it empty to keep GA4 disabled.

The checklist, content queue, and outreach templates are stored in the current browser's local storage. They are intentionally local until a shared team workspace or database-backed content library is added.

External ad, LinkedIn, and social publishing actions still require the relevant platform credentials and APIs. The control center provides the planning, segmentation, and handoff layer without pretending those external APIs are connected.

## Production checklist

- Configure Supabase RLS/authentication for every dashboard and mutation route before exposing the app to multiple users.
- Use a separate webhook secret per environment and rotate it if it is exposed.
- Confirm the sending domain, reply-to address, unsubscribe handling, and Resend limits.
- Start with a small active campaign and verify delivery, opens, replies, and queue deduplication before scaling.

## Landing page builder

The root URL is now the platform dashboard. Campaign pages are created from **Marketing → Landing Pages** and published as:

```text
https://YOUR_DOMAIN/p/your-slug
```

### Supabase setup

1. Open Supabase and select the project used by this Vercel deployment.
2. Open **SQL Editor → New query**.
3. Run the existing migrations in order if this is a new database: `000_master_reset.sql` through `018_razorpay_billing.sql`.
4. Run `019_landing_page_builder.sql` from this repository.
5. Confirm that these tables exist under **Table Editor**:
   - `landing_pages`
   - `landing_page_sections`
   - `landing_page_submissions`
6. In Supabase **Settings → API**, copy the project URL, anon key, and service-role key into Vercel as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
7. Add `MARKETING_WEBHOOK_SECRET` to Vercel. You may also add `LANDING_PAGE_ADMIN_SECRET` if you want a separate builder secret.
8. Redeploy Vercel after saving the variables.

### Creating a page

1. Open `/dashboard/marketing?tab=landing-pages`.
2. Enter the builder secret and select **Load pages**.
3. Select **New**.
4. Set the internal name, public slug, SEO title, and SEO description.
5. Edit the section content. Simple fields are editable directly; `items` fields use JSON arrays for features, FAQs, and logos.
6. Select **Save draft** while working.
7. Select **Publish** when ready.
8. Test the result at `/p/your-slug`.

Every submitted form is sent to `/api/leads`, added to the existing `contacts` table, tagged with the page slug and UTM values, and recorded in `landing_page_submissions`. Set `PUBLIC_LEAD_AUTOMATION_ENABLED=true` only after the `lead_created` automation rule has an active campaign.
