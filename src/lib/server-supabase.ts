import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const missingSupabaseConfig = () => {
    throw new Error(
        'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) in the deployment environment.',
    );
};

// Keep Vercel build-time route discovery from failing when environment
// variables have not been added yet. Runtime database calls remain guarded.
export const serverSupabase = supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    : new Proxy({} as ReturnType<typeof createClient>, {
        get: missingSupabaseConfig,
    });
