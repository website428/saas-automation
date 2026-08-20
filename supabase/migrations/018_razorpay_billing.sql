-- Razorpay billing identifiers for lifecycle automation.
-- Run after 017_finmodel_pro_automation.sql.

alter table contacts
  add column if not exists razorpay_customer_id text,
  add column if not exists razorpay_subscription_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_order_id text;

create unique index if not exists idx_contacts_razorpay_customer on contacts(razorpay_customer_id) where razorpay_customer_id is not null;
create unique index if not exists idx_contacts_razorpay_subscription on contacts(razorpay_subscription_id) where razorpay_subscription_id is not null;
create index if not exists idx_contacts_razorpay_payment on contacts(razorpay_payment_id) where razorpay_payment_id is not null;
create index if not exists idx_contacts_razorpay_order on contacts(razorpay_order_id) where razorpay_order_id is not null;

insert into marketing_automation_rules (event_key, delay_minutes, stop_events)
values ('refunded', 2, '{}')
on conflict (event_key) do nothing;
