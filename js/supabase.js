import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://luduxepqcdhuhbuobduw.supabase.co'

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1ZHV4ZXBxY2RodWhidW9iZHV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NjMwMjcsImV4cCI6MjA5NDUzOTAyN30.iqRf6AhOmAxWZFLNB0UAsHrKXkaQNjDSffiaUloH834'

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
)