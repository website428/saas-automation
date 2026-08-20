import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
const envFile = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
        env[match[1]] = match[2].replace(/(^['"]|['"]$)/g, '').trim();
    }
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);

async function main() {
  const { data: threads } = await supabase.from('inbox_threads').select('id, contact_id, subject, created_at').order('created_at', { ascending: false }).limit(20);
  console.log('Recent threads:');
  for (const t of (threads || [])) {
      console.log(`- [${t.created_at}] ${t.subject}`);
  }
}
main().catch(console.error);
