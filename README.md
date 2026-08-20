# Mail Marketing

Next.js, Supabase, and Resend campaign sender with queueing, suppression, webhook processing, and conservative domain warm-up.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the values.
2. Run `npm install` and `npm run dev`.
3. Apply the Supabase migrations in numeric order.
4. Deploy the app to Vercel, and keep the Supabase Edge Functions `process-queue`, `process-webhook`, and `resend-inbound` deployed for background email delivery and inbound mail processing. `APP_BASE_URL` must be the public HTTPS origin of the Vercel app.
5. Configure the Resend webhook secret in both Vercel and the Supabase `process-webhook` function.

Never commit `.env.local`; it contains credentials.

## Deliverability checklist

Code cannot repair reputation by itself. Before resuming campaigns:

- Send only to recipients who explicitly opted in. Do not use purchased or scraped lists.
- Verify SPF and DKIM in Resend for every From domain.
- Publish DMARC on the organizational domain. Start with monitoring (`p=none`), review reports, then tighten the policy when alignment is confirmed.
- Use a verified custom tracking subdomain if click/open tracking is enabled in Resend. Tracking is configured at the Resend domain level, not per message.
- Set `NEXT_PUBLIC_APP_URL` and `APP_BASE_URL` to the app origin and test both GET and POST requests to `/api/unsubscribe` before sending.
- Register every sending domain in Google Postmaster Tools and keep the user-reported spam rate below 0.1%; pause well before it reaches 0.3%.
- Keep hard bounces below 2%. This project automatically pauses a domain at 2% after a 25-message sample and immediately pauses on a spam complaint.
- Warm one domain at a time with engaged recipients. Do not rotate domains to evade filtering.

## Safety behavior

- A manual/forced run can skip the time window, but cannot bypass the daily limit.
- Queue rows are claimed atomically and sent with a 24-hour idempotency key.
- Unsubscribed and bounced contacts are checked again immediately before sending.
- One-click unsubscribe cancels all queued mail for that contact.
- Every marketing email has a visible unsubscribe link, RFC 8058 headers, and a plain-text alternative.
- Webhook signatures are verified before delivery events can change suppression or domain state.

## Personalized company emails

Import [personalized-contacts-template.csv](./personalized-contacts-template.csv) from **Categories → Create & Import**. Supported columns are `Email`, `Name`, `Company`, `Job Title`, `Website`, `Personalization`, `Custom Subject`, and `Custom Body`.

Campaign subjects and bodies support `{name}`, `{email}`, `{company}`, `{company_name}`, `{job_title}`, `{role}`, `{website}`, `{personalization}`, and `{personalized_line}`. When a row contains `Custom Subject` or `Custom Body`, that value overrides the campaign template only for that recipient.

The campaign builder also has **AI Personalize Selected**. Set `GEMINI_API_KEY` as a Supabase Edge Function secret and deploy the function with JWT verification enabled:

```bash
supabase secrets set GEMINI_API_KEY=replace-me GEMINI_MODEL=gemini-2.5-flash
supabase functions deploy personalize-contacts
```

Select up to 100 recipients, enter an optional brief, generate, and use the recipient selector to review each result. Generated copy is saved to the contact but no message is sent until the campaign is launched. Use **Clear selected copy** to return those contacts to the campaign's shared template.

If personalized copy is prepared outside the platform, use **Upload prepared personalized emails** in the same panel. Click **Download sample template** for an upload-ready Excel workbook with example rows and instructions. Upload an `.xlsx`, `.xls`, or `.csv` file with required columns `Email`, `Subject`, and `Body` (or `Mail`). Optional columns are `Name`, `Company`, `Job Title`, `Website`, and `Personalization`. Existing contacts are matched by email, missing contacts are created, bounced/unsubscribed contacts remain suppressed, and exactly the imported eligible recipients are selected. Uploading never sends; review the recipient previews and click **Launch** when ready.

The application enforces a shared maximum of 100 messages per UTC day and 3,000 per UTC month across campaigns, domains, inbound messages, and manual replies. Provider usage can be higher if another application uses the same Resend team/API account, so also monitor Resend's Usage page.

## Verification

```bash
npm run lint
npm run build
```

These checks do not send email.
