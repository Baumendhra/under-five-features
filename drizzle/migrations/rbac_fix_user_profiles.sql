-- ============================================================
-- EduTrace: FINAL fix for infinite recursion in user_profiles
-- Run this in Supabase SQL Editor.
-- Drops ALL policies on user_profiles and recreates them
-- using a SECURITY DEFINER helper that bypasses RLS.
-- ============================================================

-- ── 1. Drop ALL existing policies on user_profiles ────────────
DROP POLICY IF EXISTS "Users can view their own profile"           ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile"               ON public.user_profiles;
DROP POLICY IF EXISTS "Users update own non-role profile fields"   ON public.user_profiles;
DROP POLICY IF EXISTS "aicte_admin manages profiles"               ON public.user_profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone"   ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile"         ON public.user_profiles;

-- ── 2. Create a SECURITY DEFINER helper that reads role ────────
-- This runs as the function owner (bypasses RLS), so it cannot
-- trigger the policy being evaluated on user_profiles.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- ── 3. Recreate safe policies ─────────────────────────────────

-- Everyone can read their own profile
CREATE POLICY "user_profiles: owner select"
  ON public.user_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- aicte_admin can read all profiles (uses helper – no recursion)
CREATE POLICY "user_profiles: aicte_admin select all"
  ON public.user_profiles
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'aicte_admin');

-- Users can insert their own profile row (on sign-up)
CREATE POLICY "user_profiles: owner insert"
  ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update their own row (role/institution guarded in app layer)
CREATE POLICY "user_profiles: owner update"
  ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- aicte_admin can update any profile (role assignment etc.)
CREATE POLICY "user_profiles: aicte_admin update all"
  ON public.user_profiles
  FOR UPDATE TO authenticated
  USING  (public.get_my_role() = 'aicte_admin')
  WITH CHECK (public.get_my_role() = 'aicte_admin');

-- aicte_admin can delete any profile
CREATE POLICY "user_profiles: aicte_admin delete"
  ON public.user_profiles
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'aicte_admin');

-- ── Done ──────────────────────────────────────────────────────
SELECT 'user_profiles RLS recursion fixed' AS status;
