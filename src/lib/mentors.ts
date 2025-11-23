import { supabase } from './supabase';

export interface MentorProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  expertise_areas: string | string[] | null;
  location: string | null;
  availability_status: string;
}

interface MentorFetchResult {
  mentors: MentorProfile[];
  error?: string;
}

export async function fetchActiveMentors(): Promise<MentorFetchResult> {
  try {
    const { data, error } = await supabase
      .from('mentors')
      .select(
        'id, name, email, phone, expertise_areas, location, availability_status'
      )
      .eq('availability_status', 'available')
      .order('name');

    if (error) {
      console.error('Error fetching mentors:', error);
      return { mentors: [], error: error.message };
    }

    return { mentors: data || [] };
  } catch (err) {
    console.error('Unexpected error fetching mentors:', err);
    return { mentors: [], error: 'Unexpected error fetching mentors' };
  }
}