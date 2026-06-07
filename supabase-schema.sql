-- Chatice — Supabase Schema
-- Run this on a fresh project, then disable email confirmation in Auth settings.

-- 1. Users table
CREATE TABLE public.users (
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY,
  username text UNIQUE NOT NULL,
  is_online boolean DEFAULT false,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

-- 2. Conversations table
CREATE TABLE public.conversations (
  id text PRIMARY KEY,
  participants uuid[] NOT NULL,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

-- 3. Messages table
CREATE TABLE public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id text REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_messages_conversation_created ON public.messages (conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON public.messages (sender_id);
CREATE INDEX idx_users_username ON public.users (username);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS: users
CREATE POLICY "Users can view other users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- RLS: conversations
CREATE POLICY "Users can view their conversations" ON public.conversations
  FOR SELECT USING (auth.uid() = ANY(participants));
CREATE POLICY "Users can insert their conversations" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = ANY(participants));
CREATE POLICY "Users can update their conversations" ON public.conversations
  FOR UPDATE USING (auth.uid() = ANY(participants));

-- RLS: messages
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

-- Auto-sync new auth users into public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, username)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Auto-delete messages beyond 100 per conversation
CREATE OR REPLACE FUNCTION prune_old_messages()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.messages
  WHERE conversation_id = NEW.conversation_id
    AND id NOT IN (
      SELECT id FROM public.messages
      WHERE conversation_id = NEW.conversation_id
      ORDER BY created_at DESC
      LIMIT 100
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prune_messages
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION prune_old_messages();

-- === MIGRATION: images, edit, delete, avatars ===

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_content text;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE POLICY "Users can update own messages" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id);

CREATE POLICY "Users can delete own messages" ON public.messages
  FOR DELETE USING (auth.uid() = sender_id);

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-images', 'chat-images', true) ON CONFLICT DO NOTHING;

CREATE POLICY "Public avatar read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own avatar" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Public chat image read" ON storage.objects FOR SELECT USING (bucket_id = 'chat-images');
CREATE POLICY "Authenticated users upload chat images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-images' AND auth.role() = 'authenticated');

-- ================================================================
-- MIGRATION: all new features (read receipts, voice, pinning, etc.)
-- ================================================================

-- conversation_reads (enables unread counts + read receipts)
CREATE TABLE IF NOT EXISTS public.conversation_reads (
  user_id        uuid REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  last_read_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);
ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users manage own reads" ON public.conversation_reads
  FOR ALL USING (auth.uid() = user_id);

-- message_reactions (emoji reactions)
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES public.users(id)    ON DELETE CASCADE NOT NULL,
  emoji      text NOT NULL,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users view reactions" ON public.message_reactions FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Users insert reactions" ON public.message_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users delete reactions" ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);

-- Reply fields on messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id           uuid,
  ADD COLUMN IF NOT EXISTS reply_to_content      text,
  ADD COLUMN IF NOT EXISTS reply_to_sender_id    uuid,
  ADD COLUMN IF NOT EXISTS reply_to_message_type text;

-- last_seen_at on users (for "last seen X ago" in chat header)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- pinned_messages (one pinned message per conversation)
CREATE TABLE IF NOT EXISTS public.pinned_messages (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id text NOT NULL,
  message_id      uuid REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  message_content text NOT NULL,
  message_type    text NOT NULL DEFAULT 'text',
  pinned_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  pinned_at       timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  UNIQUE(conversation_id, message_id)
);
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users view pinned" ON public.pinned_messages FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Users insert pinned" ON public.pinned_messages FOR INSERT WITH CHECK (auth.uid() = pinned_by);
CREATE POLICY IF NOT EXISTS "Users delete pinned" ON public.pinned_messages FOR DELETE USING (true);

-- user_pinned_conversations (starred chats in sidebar)
CREATE TABLE IF NOT EXISTS public.user_pinned_conversations (
  user_id         uuid REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  pinned_at       timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  PRIMARY KEY (user_id, conversation_id)
);
ALTER TABLE public.user_pinned_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users manage pinned convos" ON public.user_pinned_conversations
  FOR ALL USING (auth.uid() = user_id);

-- Storage bucket for voice messages (reuses chat-images bucket)
-- Voice messages are stored under the chat-images bucket as audio files.
-- (already covered by existing chat-images policies)
