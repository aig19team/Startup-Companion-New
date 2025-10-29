/*
  # Fix User Sessions RLS Policies and Constraints

  ## Problem Analysis
  The current RLS policy uses a single "ALL" policy which can sometimes cause issues.
  Additionally, the service_type CHECK constraint doesn't include 'chat_session' or 'confirmed_idea_flow'
  which are used by the application.

  ## Changes Made
  
  1. **RLS Policy Updates**
     - Drop existing "ALL" policy
     - Create separate, explicit policies for SELECT, INSERT, UPDATE, DELETE operations
     - Ensure policies properly validate auth.uid() = user_id for all operations
  
  2. **Service Type Constraint**
     - Update CHECK constraint to include 'chat_session' and 'confirmed_idea_flow'
     - Allow the application to use these service types
  
  3. **Column Nullable Constraint**
     - Ensure user_id is NOT NULL for data integrity
     - Add constraint to prevent orphaned sessions

  ## Security Notes
  - All policies restrict access to authenticated users only
  - Users can only access their own sessions (auth.uid() = user_id)
  - INSERT policy ensures users cannot create sessions for other users
  - UPDATE and DELETE policies ensure users cannot modify other users' sessions
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Users can manage their own sessions" ON user_sessions;
DROP POLICY IF EXISTS "Users can view own sessions" ON user_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON user_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON user_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON user_sessions;

-- Create explicit SELECT policy
CREATE POLICY "Users can view own sessions"
  ON user_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create explicit INSERT policy
CREATE POLICY "Users can insert own sessions"
  ON user_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create explicit UPDATE policy
CREATE POLICY "Users can update own sessions"
  ON user_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create explicit DELETE policy (for cleanup)
CREATE POLICY "Users can delete own sessions"
  ON user_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Update service_type CHECK constraint to include all valid service types
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_service_type_check;

ALTER TABLE user_sessions 
  ADD CONSTRAINT user_sessions_service_type_check 
  CHECK (service_type IN (
    'idea_tuning',
    'registration',
    'compliance',
    'branding',
    'hr_setup',
    'financial_planning',
    'registration_guide_guru',
    'chat_session',
    'confirmed_idea_flow'
  ));

-- Update session_status CHECK constraint
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_session_status_check;

ALTER TABLE user_sessions 
  ADD CONSTRAINT user_sessions_session_status_check 
  CHECK (session_status IN ('active', 'completed', 'abandoned', 'escalated'));

-- Ensure user_id is NOT NULL for data integrity
-- First, clean up any existing NULL user_id rows (there shouldn't be any)
DELETE FROM user_sessions WHERE user_id IS NULL;

-- Now make the column NOT NULL
ALTER TABLE user_sessions ALTER COLUMN user_id SET NOT NULL;