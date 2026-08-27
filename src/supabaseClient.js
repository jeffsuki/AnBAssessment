// Supabase connection for the Above & Beyond apps.
// -----------------------------------------------------------------------------
// Fill these two in with YOUR project's values, found in the Supabase dashboard
// under: Project Settings > API.
//   - SUPABASE_URL:      "Project URL"           (e.g. https://abcdxyz.supabase.co)
//   - SUPABASE_ANON_KEY: "Project API keys" > anon / public key
//
// The anon key is safe to ship in a public frontend — it only grants what your
// Row Level Security policies allow. (Never put the service_role key here.)
//
// STORAGE_BUCKET must match a bucket you create in the Supabase dashboard under
// Storage (create one named exactly this, and mark it public for simple links).

import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "PASTE_YOUR_PROJECT_URL_HERE";
export const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_KEY_HERE";
export const STORAGE_BUCKET = "assessment-files";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const isConfigured =
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;
