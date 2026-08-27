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

export const SUPABASE_URL = "https://dufpedtybelfkpiruwyb.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1ZnBlZHR5YmVsZmtwaXJ1d3liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MTQ0MDcsImV4cCI6MjEwMzM5MDQwN30.I45Nqym2pXAQU3PwC8UL2JVW1xF9k5nz3W5bN0qsQPU";
export const STORAGE_BUCKET = "assessment-files";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const isConfigured =
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;
