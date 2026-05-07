import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://drgyiomtwxjuhzbhgegs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyZ3lpb210d3hqdWh6YmhnZWdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMjEwNTMsImV4cCI6MjA5MzY5NzA1M30.0eo6X34EvxvZ-g-DJ97nfjKOstqKF5bRDhmi_NgpktE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
