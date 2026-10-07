-- ============================================================================
-- Script de Diagnóstico e Atualização do Perfil da Adepta Sónia
-- ============================================================================
--
-- Executar no Supabase SQL Editor.
--
-- O QUE FAZ:
-- 1. Localiza a conta e/ou perfil com o nome ou email "Sónia" / "Sonia".
-- 2. Converte o seu papel para 'supporter' (Adepta) caso estivesse como 'player'.
-- 3. Limpa camisola, posições e quotas (adeptos não pagam quotas nem têm campos desportivos).
-- 4. Devolve o perfil para conferência direta.
-- ============================================================================

-- 1. Atualizar perfil existente caso esteja registado com papel 'player' ou outro
UPDATE public.profiles
   SET role = 'supporter'::user_role,
       roles = ARRAY['supporter']::user_role[],
       jersey_number = NULL,
       position = NULL,
       quota_start_date = NULL,
       quota_end_date = NULL,
       status = 'active'
 WHERE name ILIKE '%sonia%'
    OR name ILIKE '%sónia%'
    OR email ILIKE '%sonia%';

-- 2. Desativar notificações de quotas caso existam
UPDATE public.notification_preferences
   SET quotas_em_atraso = false
 WHERE profile_id IN (
   SELECT id FROM public.profiles
    WHERE name ILIKE '%sonia%'
       OR name ILIKE '%sónia%'
       OR email ILIKE '%sonia%'
 );

-- 3. Exibir o perfil da Sónia para verificação imediata dos dados
SELECT id,
       name,
       shirt_name,
       email,
       phone,
       role,
       roles,
       status,
       created_at
  FROM public.profiles
 WHERE name ILIKE '%sonia%'
    OR name ILIKE '%sónia%'
    OR email ILIKE '%sonia%';
