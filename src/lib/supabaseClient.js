import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ivrbgxkwsedorlscrruf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2cmJneGt3c2Vkb3Jsc2NycnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDcyNDAsImV4cCI6MjEwMjAyMzI0MH0.eF6Wl5J3Y_hB2Uao1ppyOd-BR9xtXtfYD-bzHaTtmj0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
