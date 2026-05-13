import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://zzitwabklisukpoqsxkg.supabase.co'

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6aXR3YWJrbGlzdWtwb3FzeGtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NzExMTIsImV4cCI6MjA5NDI0NzExMn0._qP2qr2pXwgjCnFJd-CNQ1OXAxJ_dnAWkHMy46XkfMU'

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
)
