-- ============================================================================
-- Migração: Correção de RLS para utilizadores com múltiplos papéis (Direção + Jogador)
-- e flexibilização de restrição de pé preferido
-- ============================================================================
-- Contexto:
-- 1. O utilizador André Couto (e qualquer membro que seja da Direção e simultaneamente
--    Jogador) não conseguia alterar dados de atletas (ex: número da camisola),
--    porque public.get_user_role() inspecionava apenas a coluna escalar `role`.
--    Se `role` fosse 'player', a RLS rejeitava as edições da equipa técnica/direção.
-- 2. A função public.get_user_role() passa agora a inspecionar tanto a coluna `role`
--    como o array `roles`, devolvendo o nível de privilégio mais elevado
--    ('admin' > 'coach' > 'player' > 'supporter').
-- 3. As políticas RLS de `profiles` e `quota_exemptions` são reforçadas para
--    verificar explicitamente `ANY(public.get_user_roles())`.
-- 4. O constraint `profiles_preferred_foot_check` passa a aceitar valores
--    case-insensitive (`lower(preferred_foot) IN ('direito', 'esquerdo', 'ambos')`).
-- 5. Os perfis existentes com papéis múltiplos são alinhados na base de dados.
-- ============================================================================

BEGIN;

-- 1. Redefinição de get_user_role() para suportar papéis múltiplos (roles[])
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role AS $$
DECLARE
  r public.user_role;
  rs public.user_role[];
BEGIN
  SELECT role, roles INTO r, rs FROM public.profiles WHERE id = auth.uid();
  IF 'admin' = ANY(rs) OR r = 'admin' THEN
    RETURN 'admin'::public.user_role;
  ELSIF 'coach' = ANY(rs) OR r = 'coach' THEN
    RETURN 'coach'::public.user_role;
  ELSIF 'player' = ANY(rs) OR r = 'player' THEN
    RETURN 'player'::public.user_role;
  ELSIF 'supporter' = ANY(rs) OR r = 'supporter' THEN
    RETURN 'supporter'::public.user_role;
  ELSE
    RETURN COALESCE(r, 'player'::public.user_role);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- 2. Atualizar políticas em public.profiles
DROP POLICY IF EXISTS "Equipa técnica edita qualquer ficha" ON public.profiles;
CREATE POLICY "Equipa técnica edita qualquer ficha"
ON public.profiles FOR UPDATE TO authenticated
USING (
  public.get_user_role() IN ('coach', 'admin')
  OR 'admin' = ANY(public.get_user_roles())
  OR 'coach' = ANY(public.get_user_roles())
)
WITH CHECK (
  public.get_user_role() IN ('coach', 'admin')
  OR 'admin' = ANY(public.get_user_roles())
  OR 'coach' = ANY(public.get_user_roles())
);

DROP POLICY IF EXISTS "Criar a própria ficha ou, sendo equipa técnica, qualquer uma" ON public.profiles;
CREATE POLICY "Criar a própria ficha ou, sendo equipa técnica, qualquer uma"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = id
  OR public.get_user_role() IN ('coach', 'admin')
  OR 'admin' = ANY(public.get_user_roles())
  OR 'coach' = ANY(public.get_user_roles())
);

DROP POLICY IF EXISTS "Ficha completa: só o próprio e a equipa técnica" ON public.profiles;
CREATE POLICY "Ficha completa: só o próprio e a equipa técnica"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR public.get_user_role() IN ('coach', 'admin')
  OR 'admin' = ANY(public.get_user_roles())
  OR 'coach' = ANY(public.get_user_roles())
);

DROP POLICY IF EXISTS "Apagar fichas: equipa técnica, ou as do meu email" ON public.profiles;
CREATE POLICY "Apagar fichas: equipa técnica, ou as do meu email"
ON public.profiles FOR DELETE TO authenticated
USING (
  public.get_user_role() IN ('coach', 'admin')
  OR 'admin' = ANY(public.get_user_roles())
  OR 'coach' = ANY(public.get_user_roles())
  OR (
    email IS NOT NULL
    AND lower(email) = lower(NULLIF(auth.jwt() ->> 'email', ''))
  )
);

-- 3. Atualizar política em public.quota_exemptions
DROP POLICY IF EXISTS "Admins gerem as dispensas de quota" ON public.quota_exemptions;
CREATE POLICY "Admins gerem as dispensas de quota"
ON public.quota_exemptions FOR ALL
TO authenticated
USING (
  public.get_user_role() = 'admin'
  OR 'admin' = ANY(public.get_user_roles())
)
WITH CHECK (
  public.get_user_role() = 'admin'
  OR 'admin' = ANY(public.get_user_roles())
);

-- 4. Constraint de pé preferido sem distinção de maiúsculas/minúsculas
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_preferred_foot_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_preferred_foot_check
    CHECK (preferred_foot IS NULL
           OR lower(preferred_foot) IN ('direito', 'esquerdo', 'ambos'));

UPDATE public.profiles
   SET preferred_foot = lower(preferred_foot)
 WHERE preferred_foot IS NOT NULL;

-- 5. Alinhamento de dados para contas com papéis múltiplos
UPDATE public.profiles
   SET role = 'admin'::public.user_role
 WHERE 'admin' = ANY(roles) AND role <> 'admin';

UPDATE public.profiles
   SET role = 'coach'::public.user_role
 WHERE 'coach' = ANY(roles) AND NOT ('admin' = ANY(roles)) AND role <> 'coach';

-- Garantir especificamente para o perfil do André Couto
UPDATE public.profiles
   SET role = 'admin'::public.user_role,
       roles = ARRAY['admin', 'player']::public.user_role[]
 WHERE lower(email) = 'andre.coutofz@gmail.com';

COMMIT;
