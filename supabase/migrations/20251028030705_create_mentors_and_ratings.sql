-- Create mentors table
CREATE TABLE IF NOT EXISTS mentors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  specialization text[] NOT NULL DEFAULT '{}',
  bio text NOT NULL,
  availability_status text DEFAULT 'active' CHECK (availability_status IN ('active', 'busy', 'inactive')),
  total_consultations integer DEFAULT 0,
  average_rating numeric(3,2) DEFAULT 0.00,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE mentors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mentors' AND policyname = 'Authenticated users can view active mentors') THEN
    CREATE POLICY "Authenticated users can view active mentors" ON mentors FOR SELECT TO authenticated USING (availability_status = 'active');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mentors_specialization ON mentors USING GIN(specialization);

-- Insert sample mentors
INSERT INTO mentors (name, email, phone, specialization, bio, availability_status) VALUES
('Rajesh Kumar', 'rajesh.kumar@startupadvisor.in', '+91-98765-43210', ARRAY['registration', 'compliance'], 'CA with 15+ years of experience in company registration and legal compliance. Helped 500+ startups with incorporation and regulatory matters.', 'active'),
('Priya Sharma', 'priya.sharma@businessguru.in', '+91-98765-43211', ARRAY['idea_tuning', 'branding'], 'Business strategist and brand consultant. MBA from IIM-A with expertise in market validation and brand positioning for early-stage startups.', 'active'),
('Amit Patel', 'amit.patel@financeexpert.in', '+91-98765-43212', ARRAY['financial_planning', 'compliance'], 'Chartered Accountant specializing in startup finances, fundraising, and financial planning. 10+ years helping founders with cap tables and funding rounds.', 'active'),
('Sneha Reddy', 'sneha.reddy@hrpro.in', '+91-98765-43213', ARRAY['hr_setup', 'compliance'], 'HR consultant with expertise in building teams for startups. Helped 200+ companies with hiring, policy creation, and employee management.', 'active'),
('Vikram Singh', 'vikram.singh@legaladvisor.in', '+91-98765-43214', ARRAY['registration', 'compliance', 'branding'], 'Corporate lawyer with deep expertise in business registration, IP protection, and legal compliance. LLB from NLU Delhi.', 'active'),
('Ananya Iyer', 'ananya.iyer@businesscoach.in', '+91-98765-43215', ARRAY['idea_tuning', 'financial_planning'], 'Serial entrepreneur and business coach. Founded 3 successful startups and now helps founders validate ideas and create sustainable business models.', 'active')
ON CONFLICT DO NOTHING;

-- Create service_ratings table
CREATE TABLE IF NOT EXISTS service_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback_reason text,
  mentor_assigned boolean DEFAULT false,
  mentor_id uuid REFERENCES mentors(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE service_ratings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_ratings' AND policyname = 'Users can insert own ratings') THEN
    CREATE POLICY "Users can insert own ratings" ON service_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_ratings' AND policyname = 'Users can view own ratings') THEN
    CREATE POLICY "Users can view own ratings" ON service_ratings FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_ratings' AND policyname = 'Users can update own ratings') THEN
    CREATE POLICY "Users can update own ratings" ON service_ratings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_ratings_user_id ON service_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_service_ratings_session_id ON service_ratings(session_id);
CREATE INDEX IF NOT EXISTS idx_service_ratings_service_type ON service_ratings(service_type);
CREATE INDEX IF NOT EXISTS idx_service_ratings_rating ON service_ratings(rating);