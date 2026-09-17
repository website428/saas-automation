# Mail Marketing

Next.js, Supabase, and Resend campaign sender with queueing, suppression, webhook processing, and conservative domain warm-up.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the values.
2. Run `npm install` and `npm run dev`.
3. Apply the Supabase migrations in numeric order through the latest migration in `supabase/migrations`. Migrations 022 and 023 are idempotent repairs for production databases that missed earlier schema changes; migrations 025–027 repair landing assets, outbound reply IDs, and safe campaign deletion; migration 028 adds Calendly booking fields and payment attribution. If quota checks report a missing RPC, run 023 in the Supabase SQL editor and retry the campaign after the schema cache refreshes.
4. Deploy the app to Vercel, and keep the Supabase Edge Functions `process-queue`, `process-webhook`, and `resend-inbound` deployed for background email delivery and inbound mail processing. `APP_BASE_URL` must be the public HTTPS origin of the Vercel app.
5. Configure the Resend webhook secret in both Vercel and the Supabase `process-webhook` function.
6. Configure `REPLY_TO_EMAIL` in both Vercel and Supabase Edge Function secrets. It must point to a mailbox whose domain has an MX record. Alternatively, enable Resend Receiving for every sending domain and publish the exact inbound MX record Resend provides. The sending workers deliberately stop when reply receiving is missing or cannot be verified.
7. Create a separate Resend **Full access** API key for Receiving and set it as `RESEND_RECEIVING_API_KEY` in Vercel and the `resend-inbound` Edge Function. `RESEND_API_KEY` can remain a restricted sending key. Resend sending-only keys cannot read the Receiving API, which the inbound handler uses to retrieve reply bodies.
8. Configure two Resend webhooks: an outbound-events webhook to `process-webhook` for `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, and `email.complained`; and one inbound webhook to `resend-inbound` for `email.received`. Store their signing secrets separately as `RESEND_WEBHOOK_SECRET` and `RESEND_INBOUND_WEBHOOK_SECRET`. Do not create two `email.received` webhooks, or replies will be processed twice.

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
- Manual/forced runs send initial messages only; automatic follow-ups always wait for their configured delay.
- Queue rows are claimed atomically and sent with a 24-hour idempotency key.
- Unsubscribed and bounced contacts are checked again immediately before sending.
- One-click unsubscribe cancels all queued mail for that contact.
- A reply, bounce, complaint, or unsubscribe cancels every remaining follow-up for that recipient.
- Every marketing email has a visible unsubscribe link, RFC 8058 headers, and a plain-text alternative.
- Webhook signatures are verified before delivery events can change suppression or domain state.
- The campaign screen checks the Reply-To mailbox and shows exact server-side delivery/reply counts. “Delivered” means the recipient's mail server accepted the message; it does not prove Primary Inbox placement.

## Personalized company emails

Import [personalized-contacts-template.csv](./personalized-contacts-template.csv) from **Categories → Create & Import**. Supported columns are `Email`, `Name`, `Company`, `Job Title`, `Website`, `Personalization`, `Custom Subject`, and `Custom Body`.

Campaign subjects and bodies support `{name}`, `{email}`, `{company}`, `{company_name}`, `{job_title}`, `{role}`, `{website}`, `{personalization}`, and `{personalized_line}`. When a row contains `Custom Subject` or `Custom Body`, that value overrides the campaign template only for that recipient.

The campaign builder also has **AI Personalize Selected**. Set `GEMINI_API_KEY` as a Supabase Edge Function secret and deploy the function with JWT verification enabled:

```bash
supabase secrets set GEMINI_API_KEY=replace-me GEMINI_MODEL=gemini-2.5-flash
supabase functions deploy personalize-contacts
```

Select up to 100 recipients, enter an optional brief, generate, and use the recipient selector to review each result. Generated copy is saved to the contact but no message is sent until the campaign is launched. Use **Clear selected copy** to return those contacts to the campaign's shared template.

If personalized copy is prepared outside the platform, use **Upload prepared personalized emails** in the same panel. Click **Download sample template** for an upload-ready Excel workbook with example rows and instructions. Upload an `.xlsx`, `.xls`, or `.csv` file with required columns `Email`, `Subject`, and `Body` (or `Mail`). Optional columns are `Name`, `Company`, `Job Title`, `Website`, `Personalization`, `Follow-Up 1`, and `Follow-Up 2`. Common variants such as `Existing Email`, `Subject Line`, and `Email Body` are also accepted. Existing contacts are matched by email, missing contacts are created, bounced/unsubscribed contacts remain suppressed, and exactly the imported eligible recipients are selected. When the campaign is launched, each recipient's subject, body, and optional follow-up bodies are copied onto that recipient's queue items so later contact edits cannot change the scheduled messages. Uploading never sends; review the recipient previews and click **Launch** when ready.

The **Excel Campaign Automation** panel also fills the campaign name and campaign-level fallback copy from the uploaded file. After validation, choose **Create automation draft** to build the complete queue without sending, or **Activate automated schedule** to create an active campaign whose initial messages begin from the following day inside the selected domain's sending window. Duplicate email rows are merged and reported; suppressed recipients are never selected.

After a spreadsheet upload, the campaign contact table is locked to that workbook's imported contacts; a background database refresh cannot append or select unrelated contacts. The unfiltered database view starts with zero contacts selected, preventing an accidental all-database campaign. Selecting a category selects only that category's pending contacts.

On a campaign's detail page, **Recipient Email Preview** reads the immutable queue snapshots rather than displaying only the campaign fallback. Use its recipient/step selector to inspect the exact initial email and follow-ups saved for every company. Excel-style placeholders such as `{{First Name}}` are normalized on new imports and are also resolved safely by both sending workers for already-created drafts.

## Automatic follow-ups

In the campaign builder, enable **Automatic Follow-up Sequence**, choose the delay after the initial email, and optionally enable a second follow-up with its own delay. A spreadsheet's `Follow-Up 1` and `Follow-Up 2` values override the shared portal text for that recipient; blank spreadsheet cells use the shared fallback when one is provided. Follow-ups use `Re: <original subject>` unless a shared follow-up subject is entered.

The next step is sent only after the preceding message was actually sent. If quota or scheduling delays the preceding message, the follow-up waits and recalculates from the actual send time. Draft campaigns do not send. All steps count toward the shared 100-per-day and 3,000-per-month limits.

The application enforces a shared maximum of 100 messages per UTC day and 3,000 per UTC month across campaigns, domains, inbound messages, and manual replies. Provider usage can be higher if another application uses the same Resend team/API account, so also monitor Resend's Usage page.

## Real-time reply tracking and replies

In Resend, enable Receiving for each reply domain and add the MX record shown by Resend. Create one `email.received` webhook pointing to the deployed `resend-inbound` Edge Function (or the Next.js `/api/webhooks/inbound` route, but do not configure both for the same event). Set its signing secret as `RESEND_INBOUND_WEBHOOK_SECRET`, and give the receiving handler a **Full access** Resend key as `RESEND_RECEIVING_API_KEY`; a sending-only key cannot retrieve message bodies. The function retrieves the full message from Resend, matches it by `In-Reply-To`/queue ID or sender, stores the inbound message in `inbox_threads` and `inbox_messages`, and cancels that recipient's remaining follow-ups.

Open **Inbox** to see unread replies. The page subscribes to Supabase Realtime for new messages and thread changes, shows a Live/Polling indicator, refreshes automatically every 30 seconds as a fallback, and displays the last event time. Select a thread to read the complete conversation and use **Send** to reply from the same sending domain; **AI** can draft a response for review before sending. Failed replies now show the provider error instead of silently disappearing.

## Verification

```bash
npm run lint
npm run build
```

These checks do not send email.
