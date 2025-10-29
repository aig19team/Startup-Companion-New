import { supabase } from './supabase';

export interface UserSession {
  id: string;
  user_id: string;
  service_type: string;
  status: 'active' | 'completed' | 'abandoned';
  started_at: string;
  completed_at?: string;
  rating?: number;
  rating_feedback?: string;
  mentor_assigned?: boolean;
  created_at: string;
}

export async function createSession(userId: string, serviceType: string): Promise<string | null> {
  try {
    console.log('Creating session for user:', userId, 'service:', serviceType);

    const { data, error } = await supabase
      .from('user_sessions')
      .insert([{
        user_id: userId,
        service_type: serviceType,
        session_status: 'active'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating session:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return null;
    }

    console.log('Session created successfully:', data.id);
    return data.id;
  } catch (err) {
    console.error('Unexpected error creating session:', err);
    if (err instanceof Error) {
      console.error('Error name:', err.name);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
    }
    return null;
  }
}

export async function updateSessionStatus(
  sessionId: string,
  status: 'completed' | 'abandoned'
): Promise<boolean> {
  try {
    const updateData: any = {
      session_status: status,
      updated_at: new Date().toISOString()
    };

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('user_sessions')
      .update(updateData)
      .eq('id', sessionId);

    if (error) {
      console.error('Error updating session:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return false;
    }

    return true;
  } catch (err) {
    console.error('Unexpected error updating session:', err);
    if (err instanceof Error) {
      console.error('Error details:', err.message);
    }
    return false;
  }
}

export async function getUserSessions(userId: string): Promise<UserSession[]> {
  try {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Unexpected error fetching sessions:', err);
    return [];
  }
}

export async function getSessionMessages(sessionId: string) {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Unexpected error fetching messages:', err);
    return [];
  }
}

export async function saveChatMessage(
  sessionId: string,
  userId: string,
  messageType: 'user' | 'ai',
  content: string
): Promise<boolean> {
  try {
    console.log('Saving chat message:', { sessionId, userId, messageType });
    const { error } = await supabase
      .from('chat_messages')
      .insert([{
        session_id: sessionId,
        user_id: userId,
        message_type: messageType,
        content: content
      }]);

    if (error) {
      console.error('Error saving chat message:', error);
      return false;
    }

    console.log('Chat message saved successfully');
    return true;
  } catch (err) {
    console.error('Unexpected error saving chat message:', err);
    return false;
  }
}

export function getServiceDisplayName(serviceType: string): string {
  const serviceNames: Record<string, string> = {
    'idea_tuning': 'Idea Tuning',
    'registration': 'Registration',
    'registration_guide_guru': 'Registration Guide Guru',
    'compliance': 'Compliance',
    'branding': 'Branding',
    'hr_setup': 'HR Setup',
    'financial_planning': 'Financial Planning',
    'confirmed_idea_flow': 'Confirmed Idea Flow'
  };

  return serviceNames[serviceType] || serviceType;
}
