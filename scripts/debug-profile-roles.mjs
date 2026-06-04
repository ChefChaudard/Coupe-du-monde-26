import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: './.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE URL or KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

const main = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, nickname, first_name, last_name, role, roles, is_admin, time_zone')
    .limit(50);

  console.log('error:', error);
  console.log('data:', JSON.stringify(data, null, 2));
};

main();
