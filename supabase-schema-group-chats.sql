-- ================================================================
-- MIGRATION: Group Chats (Complete & Clean)
-- Run this in Supabase SQL Editor to add group chat functionality
-- ================================================================

-- 0. Clean up any previous failed attempts (use DO block to handle if they don't exist)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Group members can view group membership" ON public.group_members;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP TABLE IF EXISTS public.group_members CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP FUNCTION IF EXISTS public.create_group_conversation(text, uuid[]);
  DROP FUNCTION IF EXISTS public.add_group_member(text, uuid);
  DROP FUNCTION IF EXISTS public.remove_group_member(text, uuid);
  DROP FUNCTION IF EXISTS public.get_group_members(text);
  DROP FUNCTION IF EXISTS public.get_user_groups(uuid);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view group chats they're members of" ON public.conversations;
  DROP POLICY IF EXISTS "Users can update group chats they belong to" ON public.conversations;
  DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;
  DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
  DROP POLICY IF EXISTS "Users can insert conversations" ON public.conversations;
  DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
  DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON public.messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 1. Add group chat columns to conversations table
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS group_avatar_url text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);

-- 2. Create group_members table for tracking group membership
CREATE TABLE public.group_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  UNIQUE(conversation_id, user_id)
);

-- Indexes for group_members
CREATE INDEX idx_group_members_conv ON public.group_members (conversation_id);
CREATE INDEX idx_group_members_user ON public.group_members (user_id);

-- 3. Enable RLS on group_members
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for group_members - using text casts for auth.uid() comparisons
CREATE POLICY "Group members can view group membership" ON public.group_members
  FOR SELECT USING (
    auth.uid()::text = user_id::text OR
    EXISTS (
      SELECT 1 FROM public.group_members gm2
      WHERE gm2.conversation_id = group_members.conversation_id
      AND gm2.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Group members can join groups" ON public.group_members
  FOR INSERT WITH CHECK (
    auth.uid()::text = user_id::text
  );

CREATE POLICY "Group members can remove themselves" ON public.group_members
  FOR DELETE USING (
    auth.uid()::text = user_id::text
  );

CREATE POLICY "Group members can update themselves" ON public.group_members
  FOR UPDATE USING (
    auth.uid()::text = user_id::text
  );

-- 4. Update conversation RLS policies for group chats
-- For viewing: allow if user is participant (DMs) or member (groups)
CREATE POLICY "Users can view their conversations" ON public.conversations
  FOR SELECT USING (
    auth.uid() = ANY(participants) OR
    (is_group = true AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.conversation_id = public.conversations.id
      AND gm.user_id = auth.uid()
    ))
  );

-- For inserting: allow if user is a participant (DMs) or creating a group
CREATE POLICY "Users can insert conversations" ON public.conversations
  FOR INSERT WITH CHECK (
    auth.uid() = ANY(participants)
  );

-- For updating: allow if admin of group
CREATE POLICY "Users can update their conversations" ON public.conversations
  FOR UPDATE USING (
    is_group = true AND
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.conversation_id = public.conversations.id
      AND gm.user_id = auth.uid()
      AND gm.role = 'admin'
    )
  );

-- 5. Add messages policy for group chats
CREATE POLICY "Users can view messages in their conversations" ON public.messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND auth.uid() = ANY(c.participants))
  );

CREATE POLICY "Users can insert messages in their conversations" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND auth.uid() = ANY(c.participants))
  );

-- 6. RPC Functions

-- Create a group conversation
CREATE FUNCTION public.create_group_conversation(
  p_group_name text,
  p_participant_ids uuid[]
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv_id text;
  v_sorted_ids text[];
  v_admin_id uuid;
BEGIN
  SELECT array_agg(id::text ORDER BY id) INTO v_sorted_ids FROM unnest(p_participant_ids) AS id;
  v_conv_id := 'group_' || array_to_string(v_sorted_ids, '_');
  v_admin_id := auth.uid();
  
  IF EXISTS (SELECT 1 FROM public.conversations WHERE id = v_conv_id) THEN
    RETURN v_conv_id;
  END IF;
  
  INSERT INTO public.conversations (id, is_group, group_name, participants, created_by, created_at, updated_at)
  VALUES (v_conv_id, true, p_group_name, p_participant_ids, v_admin_id, timezone('utc', now()), timezone('utc', now()));
  
  INSERT INTO public.group_members (conversation_id, user_id, role)
  SELECT v_conv_id, unnest_id::uuid, CASE WHEN unnest_id::uuid = v_admin_id THEN 'admin' ELSE 'member' END
  FROM unnest(v_sorted_ids) AS unnest_id;
  
  RETURN v_conv_id;
END;
$$;

-- Add member to group
CREATE FUNCTION public.add_group_member(
  p_conversation_id text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.group_members 
    WHERE conversation_id = p_conversation_id 
    AND user_id = p_user_id
  ) THEN
    RETURN;
  END IF;
  
  INSERT INTO public.group_members (conversation_id, user_id, role)
  VALUES (p_conversation_id, p_user_id, 'member');
  
  UPDATE public.conversations
  SET participants = participants || p_user_id,
      updated_at = timezone('utc', now())
  WHERE id = p_conversation_id;
END;
$$;

-- Remove member from group
CREATE FUNCTION public.remove_group_member(
  p_conversation_id text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.group_members
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
  
  UPDATE public.conversations
  SET participants = array_remove(participants, p_user_id),
      updated_at = timezone('utc', now())
  WHERE id = p_conversation_id;
END;
$$;

-- Get group members
CREATE FUNCTION public.get_group_members(p_conversation_id text)
RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, role text, joined_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT gm.user_id, u.username, u.display_name, u.avatar_url, gm.role, gm.joined_at
  FROM public.group_members gm
  JOIN public.users u ON u.id = gm.user_id
  WHERE gm.conversation_id = p_conversation_id;
END;
$$;

-- Get user's group conversations
CREATE FUNCTION public.get_user_groups(p_user_id uuid)
RETURNS TABLE(id text, group_name text, group_avatar_url text, participants uuid[], updated_at timestamptz, member_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.group_name,
    c.group_avatar_url,
    c.participants,
    c.updated_at,
    COUNT(gm.id)::bigint AS member_count
  FROM conversations c
  JOIN group_members gm ON gm.conversation_id = c.id
  WHERE c.is_group = true AND gm.user_id = p_user_id
  GROUP BY c.id, c.group_name, c.group_avatar_url, c.participants, c.updated_at
  ORDER BY c.updated_at DESC;
END;
$$;

-- 6. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_group_member(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_group_member(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_members(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_groups(uuid) TO authenticated;
