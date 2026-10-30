-- Migration: 0005_sprint6_institutional_intelligence.sql
-- Description: Additive schema for EduTrace Sprint 6 Institutional Intelligence Hub
-- Purpose: Persistent insight feedback, review tracking, and institutional reports metadata.
-- Safety: Non-destructive, idempotent, preserves all existing tables and student records.

-- 1. Institutional Insight Feedback Table
CREATE TABLE IF NOT EXISTS public.institutional_insight_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    insight_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('helpful', 'inaccurate', 'dismissed', 'reviewed')),
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_insight_feedback_institution ON public.institutional_insight_feedback(institution_id);
CREATE INDEX IF NOT EXISTS idx_insight_feedback_insight ON public.institutional_insight_feedback(insight_id);
CREATE INDEX IF NOT EXISTS idx_insight_feedback_type ON public.institutional_insight_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_insight_feedback_created ON public.institutional_insight_feedback(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.institutional_insight_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policy: View feedback for own institution or AICTE admin
DROP POLICY IF EXISTS "Users can view feedback for their institution" ON public.institutional_insight_feedback;
CREATE POLICY "Users can view feedback for their institution"
ON public.institutional_insight_feedback
FOR SELECT
TO authenticated
USING (
    institution_id IN (
        SELECT institution_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = auth.uid() AND role = 'aicte_admin'
    )
);

-- RLS Policy: Create feedback for own institution
DROP POLICY IF EXISTS "Users can create feedback for their institution" ON public.institutional_insight_feedback;
CREATE POLICY "Users can create feedback for their institution"
ON public.institutional_insight_feedback
FOR INSERT
TO authenticated
WITH CHECK (
    institution_id IN (
        SELECT institution_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = auth.uid() AND role = 'aicte_admin'
    )
);

-- 2. Institutional Generated Reports Metadata Table
CREATE TABLE IF NOT EXISTS public.institutional_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL CHECK (report_type IN (
        'executive_summary',
        'registry_health',
        'data_quality',
        'corrections',
        'duplicate_identity',
        'apaar_verification',
        'intake_capacity',
        'operational_risk'
    )),
    title TEXT NOT NULL,
    reporting_period TEXT NOT NULL,
    generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    provider_used TEXT NOT NULL DEFAULT 'rule_based',
    key_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_institutional_reports_inst ON public.institutional_reports(institution_id);
CREATE INDEX IF NOT EXISTS idx_institutional_reports_type ON public.institutional_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_institutional_reports_created ON public.institutional_reports(created_at DESC);

-- Enable RLS
ALTER TABLE public.institutional_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policy: View reports for own institution or AICTE admin
DROP POLICY IF EXISTS "Users can view reports for their institution" ON public.institutional_reports;
CREATE POLICY "Users can view reports for their institution"
ON public.institutional_reports
FOR SELECT
TO authenticated
USING (
    institution_id IN (
        SELECT institution_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = auth.uid() AND role = 'aicte_admin'
    )
);

-- RLS Policy: Create reports for own institution
DROP POLICY IF EXISTS "Users can create reports for their institution" ON public.institutional_reports;
CREATE POLICY "Users can create reports for their institution"
ON public.institutional_reports
FOR INSERT
TO authenticated
WITH CHECK (
    institution_id IN (
        SELECT institution_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = auth.uid() AND role = 'aicte_admin'
    )
);

