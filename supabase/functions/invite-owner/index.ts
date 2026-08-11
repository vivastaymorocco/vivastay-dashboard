import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify the caller and check they are an admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).single()
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Accès réservé aux administrateurs' }), { status: 403 })
    }

    const { email, full_name } = await req.json()
    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: 'email et full_name requis' }), { status: 400 })
    }

    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
    })
    if (inviteErr) {
      return new Response(JSON.stringify({ error: inviteErr.message }), { status: 400 })
    }

    return new Response(JSON.stringify({ id: invited.user.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
