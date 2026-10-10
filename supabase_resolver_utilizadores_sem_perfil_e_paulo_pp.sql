-- ============================================================================
-- Migração Definitiva: Utilizadores sem Perfil e Associação de Paulo Ricardo Santos (PP)
-- ============================================================================
-- 1. Permite criação de perfis 'unassigned' por utilizadores autenticados (RLS INSERT)
-- 2. Atualiza o trigger on_auth_user_created para criar perfil 'unassigned' em novos registos
-- 3. Cria a função admin_sincronizar_contas_sem_perfil() para autocorreção contínua
-- 4. Importa imediatamente qualquer utilizador de auth.users que não tenha linha em public.profiles
-- 5. Executa a fusão da conta de login de Paulo Ricardo Santos (santospricardo1980@gmail.com)
--    com a ficha desportiva do atleta PP (santospauloricardo@sapo.pt)
-- ============================================================================

-- 1. Política de RLS para INSERT em public.profiles
DROP POLICY IF EXISTS "Criar a própria ficha ou, sendo equipa técnica, qualquer uma" ON public.profiles;

CREATE POLICY "Criar a própria ficha ou, sendo equipa técnica, qualquer uma"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
    public.get_user_role() = ANY (ARRAY['coach'::user_role, 'admin'::user_role])
    OR (
        (SELECT auth.uid()) = id
        AND role IN ('player'::user_role, 'unassigned'::user_role)
        AND (
            roles IS NULL 
            OR roles = ARRAY[]::user_role[] 
            OR roles = ARRAY['player']::user_role[] 
            OR roles = ARRAY['unassigned']::user_role[]
        )
    )
);

-- 2. Atualizar gatilho handle_new_user() para criar perfil 'unassigned' de forma à prova de falhas
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = new.id) THEN
    RETURN new;
  END IF;

  INSERT INTO public.profiles (
    id,
    name,
    email,
    role,
    roles,
    status
  )
  VALUES (
    new.id,
    COALESCE(
      NULLIF(btrim(new.raw_user_meta_data->>'full_name'), ''),
      NULLIF(btrim(new.raw_user_meta_data->>'name'), ''),
      NULLIF(btrim(new.raw_user_meta_data->>'user_name'), ''),
      split_part(new.email, '@', 1),
      'Novo Membro'
    ),
    new.email,
    'unassigned'::user_role,
    ARRAY[]::user_role[],
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user: falha ao criar perfil para %: %', new.id, SQLERRM;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Função de sincronização automática para a app chamar
CREATE OR REPLACE FUNCTION public.admin_sincronizar_contas_sem_perfil()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_inseridos integer := 0;
BEGIN
    IF auth.uid() IS NOT NULL
       AND public.get_user_role() IS DISTINCT FROM 'admin'
       AND NOT ('admin' = ANY(public.get_user_roles())) THEN
        RAISE EXCEPTION 'Apenas administradores podem executar esta sincronização.';
    END IF;

    WITH novos AS (
        INSERT INTO public.profiles (id, name, email, role, roles, status)
        SELECT 
            u.id,
            COALESCE(
                NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
                NULLIF(btrim(u.raw_user_meta_data->>'name'), ''),
                NULLIF(btrim(u.raw_user_meta_data->>'user_name'), ''),
                split_part(u.email, '@', 1),
                'Novo Membro'
            ),
            u.email,
            'unassigned'::user_role,
            ARRAY[]::user_role[],
            'active'
        FROM auth.users u
        WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    )
    SELECT count(*) INTO v_inseridos FROM novos;

    RETURN v_inseridos;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sincronizar_contas_sem_perfil() TO authenticated;

-- 4. Sincronizar já todas as contas de auth.users que não têm linha em public.profiles
INSERT INTO public.profiles (id, name, email, role, roles, status)
SELECT 
    u.id,
    COALESCE(
        NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
        NULLIF(btrim(u.raw_user_meta_data->>'name'), ''),
        NULLIF(btrim(u.raw_user_meta_data->>'user_name'), ''),
        split_part(u.email, '@', 1),
        'Novo Membro'
    ),
    u.email,
    'unassigned'::user_role,
    ARRAY[]::user_role[],
    'active'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- 5. Executar a fusão de Paulo Ricardo Santos (PP)
DO $$
DECLARE
    r_manter public.profiles%ROWTYPE;
    r_apagar public.profiles%ROWTYPE;
    v_auth_manter_id UUID;
    v_auth_apagar_id UUID;
BEGIN
    -- Localizar conta de login pelo email santospricardo1980@gmail.com
    SELECT id INTO v_auth_manter_id 
    FROM auth.users 
    WHERE lower(btrim(email)) = 'santospricardo1980@gmail.com' 
    LIMIT 1;

    IF v_auth_manter_id IS NOT NULL THEN
        -- Garantir perfil em public.profiles
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_auth_manter_id) THEN
            INSERT INTO public.profiles (id, name, email, role, status)
            VALUES (v_auth_manter_id, 'Paulo Ricardo Santos', 'santospricardo1980@gmail.com', 'unassigned', 'active');
            RAISE NOTICE 'Perfil base criado para santospricardo1980@gmail.com (id: %).', v_auth_manter_id;
        END IF;
    END IF;

    -- Obter registo da conta de login a manter
    SELECT * INTO r_manter 
    FROM public.profiles 
    WHERE (v_auth_manter_id IS NOT NULL AND id = v_auth_manter_id)
       OR lower(btrim(email)) = 'santospricardo1980@gmail.com'
    LIMIT 1;

    -- Localizar ficha desportiva do atleta PP (santospauloricardo@sapo.pt)
    SELECT * INTO r_apagar 
    FROM public.profiles 
    WHERE (
        lower(btrim(email)) = 'santospauloricardo@sapo.pt'
        OR (name ILIKE '%Paulo Ricardo Santos%' AND nickname = 'PP')
    )
    AND (r_manter.id IS NULL OR id <> r_manter.id)
    LIMIT 1;

    RAISE NOTICE '-> Conta de Login (Gmail): id=%, nome=%, email=%', r_manter.id, r_manter.name, r_manter.email;
    RAISE NOTICE '-> Ficha de Atleta (PP): id=%, nome=%, email=%', r_apagar.id, r_apagar.name, r_apagar.email;

    IF r_manter.id IS NOT NULL AND r_apagar.id IS NOT NULL THEN
        -- Se a ficha antiga de atleta tinha conta criada em auth.users, remove-a para permitir a fusão
        SELECT id INTO v_auth_apagar_id FROM auth.users WHERE id = r_apagar.id;
        IF v_auth_apagar_id IS NOT NULL THEN
            RAISE NOTICE '-> A ficha antiga tinha conta em auth.users (id: %). A remover conta antiga para permitir fusão...', v_auth_apagar_id;
            DELETE FROM auth.users WHERE id = v_auth_apagar_id;
        END IF;

        PERFORM public.admin_merge_profiles(r_manter.id, r_apagar.id);
        RAISE NOTICE 'SUCESSO: Atleta PP fundido na conta % (id: %) com sucesso!', r_manter.email, r_manter.id;
    ELSE
        IF r_manter.id IS NULL THEN
            RAISE NOTICE 'Aviso: Conta santospricardo1980@gmail.com não foi encontrada em auth.users nem em profiles.';
        END IF;
        IF r_apagar.id IS NULL THEN
            RAISE NOTICE 'Aviso: Ficha antiga do atleta PP (santospauloricardo@sapo.pt) já não existe ou já foi fundida.';
        END IF;
    END IF;
END;
$$;
