-- ==============================================================================
-- LIMPEZA DEFINITIVA DE CONTA DE TESTE E AJUSTE DE SINCRONIZAÇÃO
-- ==============================================================================

-- 1. Eliminar registos de teste na tabela match_availabilities
DELETE FROM public.match_availabilities
WHERE player_id IN (
    SELECT id FROM public.profiles 
    WHERE LOWER(name) LIKE '%teste%' 
       OR LOWER(nickname) LIKE '%teste%' 
       OR LOWER(shirt_name) LIKE '%teste%'
       OR LOWER(email) LIKE '%teste%'
       OR email LIKE '%@csc-vet.local'
       OR email LIKE '%@teste.local'
);

-- 2. Eliminar registos de teste na tabela callups
DELETE FROM public.callups
WHERE player_id IN (
    SELECT id FROM public.profiles 
    WHERE LOWER(name) LIKE '%teste%' 
       OR LOWER(nickname) LIKE '%teste%' 
       OR LOWER(shirt_name) LIKE '%teste%'
       OR LOWER(email) LIKE '%teste%'
       OR email LIKE '%@csc-vet.local'
       OR email LIKE '%@teste.local'
);

-- 3. Eliminar perfis de teste na tabela public.profiles
DELETE FROM public.profiles
WHERE LOWER(name) LIKE '%teste%' 
   OR LOWER(nickname) LIKE '%teste%' 
   OR LOWER(shirt_name) LIKE '%teste%'
   OR LOWER(email) LIKE '%teste%'
   OR email LIKE '%@csc-vet.local'
   OR email LIKE '%@teste.local';

-- 4. Opcional: Eliminar utilizadores de teste em auth.users (caso tenham sido criados com esses emails)
DELETE FROM auth.users
WHERE LOWER(email) LIKE '%teste%'
   OR email LIKE '%@csc-vet.local'
   OR email LIKE '%@teste.local';

-- 5. Atualizar ou desativar admin_sincronizar_contas_sem_perfil para nunca mais recriar contas de teste
CREATE OR REPLACE FUNCTION public.admin_sincronizar_contas_sem_perfil()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_inseridos integer := 0;
BEGIN
    -- Apenas reinsere se for um utilizador legítimo que não contenha padrões de teste
    INSERT INTO public.profiles (
        id,
        name,
        email,
        role,
        status
    )
    SELECT
        u.id,
        COALESCE(
            NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
            NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
            split_part(u.email, '@', 1)
        ) AS name,
        LOWER(trim(u.email)) AS email,
        'unassigned'::user_role,
        'active'::profile_status
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
      AND u.email IS NOT NULL
      AND LOWER(u.email) NOT LIKE '%teste%'
      AND u.email NOT LIKE '%@csc-vet.local'
      AND u.email NOT LIKE '%@teste.local'
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_inseridos = ROW_COUNT;
    RETURN v_inseridos;
END;
$$;
