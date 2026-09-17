import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// This portal does not use Supabase Auth for dashboard access. The default
// browser client still starts GoTrue and coordinates auth-token refreshes
// across every open tab with Navigator LockManager. A stale tab can then hold
// `lock:sb-<project>-auth-token` and make Excel campaign setup fail after 10s.
// Keep the auth client in memory and run its tiny critical sections directly;
// database queries and Edge Function calls continue to use the anon key.
const noNavigatorLock = async <R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => fn();

const missingSupabaseConfig = () => {
  throw new Error(
    'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the deployment environment.',
  );
};

// Do not throw while Next.js is importing route modules during build. The proxy
// still fails immediately and clearly if a request reaches the app without the
// required runtime variables.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        lock: noNavigatorLock,
      },
    })
  : new Proxy({} as ReturnType<typeof createClient>, {
      get: missingSupabaseConfig,
    });

// Types for our database tables
export interface Domain {
  id: string;
  domain_name: string;
  from_email: string;
  warmup_start_date: string | null;
  warmup_day: number;
  daily_limit: number;
  emails_sent_today: number;
  status: 'warming' | 'warm' | 'paused' | 'burned';
  bounce_rate: number;
  health_score: number;
  created_at: string;
}

export interface Contact {
  id: string;
  email: string;
  name: string | null;
  company_name: string | null;
  job_title: string | null;
  website: string | null;
  personalization: string | null;
  custom_subject: string | null;
  custom_body: string | null;
  custom_followup_1: string | null;
  custom_followup_2: string | null;
  tags: string[];
  status: 'pending' | 'sent' | 'bounced' | 'unsubscribed';
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  domain_id: string;
  subject_template: string;
  subject_template_b: string | null;
  body_html: string;
  ab_test_size: number;
  ab_winner: 'a' | 'b' | null;
  status: 'draft' | 'active' | 'paused' | 'aborted' | 'completed';
  total_contacts: number;
  sent_count: number;
  opened_count: number;
  bounced_count: number;
  created_at: string;
}

export interface Sequence {
  id: string;
  campaign_id: string;
  step_number: number;
  delay_days: number;
  subject_template: string;
  body_html: string;
  send_only_if: 'no_open' | 'always';
}

export interface EmailQueue {
  id: string;
  campaign_id: string;
  contact_id: string;
  domain_id: string;
  sequence_step: number;
  wait_days: number;
  scheduled_at: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface SendLog {
  id: string;
  queue_id: string;
  domain_id: string;
  resend_id: string | null;
  event: 'delivered' | 'bounced' | 'opened' | 'clicked' | 'complained';
  created_at: string;
}
