import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Missing Supabase credentials for mentors-list function');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data, error } = await supabaseClient
      .from('mentors')
      .select(
        'id, name, email, phone, specialization, bio, average_rating, total_consultations, availability_status'
      )
      .eq('availability_status', 'active')
      .order('average_rating', { ascending: false, nullsLast: true })
      .order('total_consultations', { ascending: false, nullsLast: true });

    if (error) {
      console.error('Error fetching mentors:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch mentors' }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    return new Response(JSON.stringify({ mentors: data ?? [] }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error('Unexpected error in mentors-list function:', err);
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});



