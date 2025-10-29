-- Create business_profiles table
CREATE TABLE IF NOT EXISTS business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  session_id uuid REFERENCES user_sessions(id) ON DELETE CASCADE,
  business_name text,
  business_type text,
  business_description text,
  company_description text,
  company_website text,
  industry text,
  location text,
  entity_type text,
  capital_investment text,
  expected_turnover text,
  directors_partners jsonb DEFAULT '[]'::jsonb,
  partners_info jsonb DEFAULT '[]'::jsonb,
  color_preference text,
  style_preference text,
  has_idea_tuning boolean DEFAULT false,
  idea_tuning_output text,
  has_branding boolean DEFAULT false,
  branding_concept_selected text,
  logo_design_url text,
  logo_variations jsonb DEFAULT '[]'::jsonb,
  logo_specifications jsonb DEFAULT '{}'::jsonb,
  color_palette jsonb DEFAULT '{}'::jsonb,
  typography jsonb DEFAULT '{}'::jsonb,
  business_card_design text,
  business_card_image_url text,
  business_card_specs jsonb DEFAULT '{}'::jsonb,
  letterhead_design text,
  letterhead_image_url text,
  letterhead_specs jsonb DEFAULT '{}'::jsonb,
  signage_design text,
  signage_image_url text,
  signage_specs jsonb DEFAULT '{}'::jsonb,
  ip_protection_info jsonb DEFAULT '{}'::jsonb,
  design_preferences jsonb DEFAULT '{}'::jsonb,
  branding_output text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_profiles' AND policyname = 'Users can view own business profiles') THEN
    CREATE POLICY "Users can view own business profiles" ON business_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_profiles' AND policyname = 'Users can insert own business profiles') THEN
    CREATE POLICY "Users can insert own business profiles" ON business_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_profiles' AND policyname = 'Users can update own business profiles') THEN
    CREATE POLICY "Users can update own business profiles" ON business_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_profiles' AND policyname = 'Users can delete own business profiles') THEN
    CREATE POLICY "Users can delete own business profiles" ON business_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_session_id ON business_profiles(session_id);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES user_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  message_type text NOT NULL CHECK (message_type IN ('user', 'ai')),
  content text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  ai_model text,
  tokens_used integer DEFAULT 0,
  message_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'Users can view own chat messages') THEN
    CREATE POLICY "Users can view own chat messages" ON chat_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'Users can insert own chat messages') THEN
    CREATE POLICY "Users can insert own chat messages" ON chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- Add update trigger for business_profiles
CREATE OR REPLACE FUNCTION update_business_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS business_profile_updated_at_trigger ON business_profiles;
CREATE TRIGGER business_profile_updated_at_trigger
  BEFORE UPDATE ON business_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_business_profile_updated_at();