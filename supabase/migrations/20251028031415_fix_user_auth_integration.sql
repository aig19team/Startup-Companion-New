-- Drop the public.users table and update all references to use auth.users directly

-- First, drop foreign key constraints that reference public.users
ALTER TABLE business_profiles DROP CONSTRAINT IF EXISTS business_profiles_user_id_fkey;
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_user_id_fkey;
ALTER TABLE generated_documents DROP CONSTRAINT IF EXISTS generated_documents_user_id_fkey;

-- Drop the public.users table
DROP TABLE IF EXISTS users CASCADE;

-- Recreate foreign key constraints pointing to auth.users
ALTER TABLE business_profiles 
  ADD CONSTRAINT business_profiles_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE user_sessions 
  ADD CONSTRAINT user_sessions_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE chat_messages 
  ADD CONSTRAINT chat_messages_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE generated_documents 
  ADD CONSTRAINT generated_documents_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;