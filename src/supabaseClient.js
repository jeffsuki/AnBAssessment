// Supabase connection for the Above & Beyond apps.
// -----------------------------------------------------------------------------
// Fill these two in with YOUR project's values (Supabase dashboard > Project
// Settings > API):
//   - SUPABASE_URL:      "Project URL"   (e.g. https://abcdxyz.supabase.co)
//   - SUPABASE_ANON_KEY: anon / public key
// The anon key is safe in a public frontend — RLS controls what it can do.
// Never put the service_role key here.
//
// STORAGE_BUCKET must match a bucket you create under Storage (mark it public).

import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://dufpedtybelfkpiruwyb.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1ZnBlZHR5YmVsZmtwaXJ1d3liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MTQ0MDcsImV4cCI6MjEwMzM5MDQwN30.I45Nqym2pXAQU3PwC8UL2JVW1xF9k5nz3W5bN0qsQPU";
export const STORAGE_BUCKET = "assessment-files";

export const isConfigured =
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;

// IMPORTANT: only build a real client when configured. Calling createClient()
// with the placeholder URL throws at import time and blanks the whole app.
// When not configured, export a harmless stub so the app still loads; the
// assessment tools show "Supabase belum dikonfigurasi" instead of crashing.
function makeStub() {
  const notReady = async () => ({
    data: null,
    error: { message: "Supabase belum dikonfigurasi (isi src/supabaseClient.js)." },
  });
  const queryStub = {
    select() { return this; },
    order() { return this; },
    insert: notReady,
    then(resolve) { return notReady().then(resolve); }, // awaitable
  };
  return {
    from() { return queryStub; },
    storage: {
      from() {
        return {
          upload: notReady,
          getPublicUrl() { return { data: { publicUrl: "" } }; },
        };
      },
    },
  };
}

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : makeStub();
