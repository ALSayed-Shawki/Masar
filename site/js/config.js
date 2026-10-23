// Public settings only. The anon key is safe to publish: every table is protected
// by Row-Level Security. Secret keys live in GitHub Secrets / Supabase secrets.
export const CONFIG = {
  SUPABASE_URL: 'https://rwetsgzvrnywftphxjrp.supabase.co',
  SUPABASE_ANON_KEY: '',
  TIMEZONE: 'Asia/Riyadh',
  // phase-2 parts (tasks, goals, ideas, money) still live in the Claude page until migrated
  LEGACY_URL: 'https://claude.ai/artifact/Dm5AT2gVZyn4wejEDnKxEG',
};
