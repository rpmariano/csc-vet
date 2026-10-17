-- ============================================================================
-- MIGRAÇÃO: PERMITIR ALTERAÇÃO DE ADVERSÁRIOS E SIGLAS (RLS E POLÍTICAS)
-- ============================================================================
-- 1. Assegura que administradores e treinadores (incluindo utilizadores
--    com múltiplos papéis ou cujo papel de direção/admin está definido no array
--    roles[]) têm permissões totais de escrita e atualização na tabela
--    public.opponents e public.fields.
-- 2. Atualiza as políticas RLS para inspecionar tanto get_user_role() como
--    get_user_roles() e consulta direta à tabela public.profiles.
-- ============================================================================

BEGIN;

-- 1. Tabela opponents: garantir RLS e permissões de leitura/escrita
ALTER TABLE public.opponents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Adversários legíveis por todos" ON public.opponents;
CREATE POLICY "Adversários legíveis por todos" 
ON public.opponents FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Apenas treinadores e admins gerem adversários" ON public.opponents;
CREATE POLICY "Apenas treinadores e admins gerem adversários"
ON public.opponents FOR ALL TO authenticated
USING (
  public.get_user_role() IN ('coach', 'admin')
  OR 'admin' = ANY(public.get_user_roles())
  OR 'coach' = ANY(public.get_user_roles())
  OR EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() 
      AND (
        p.role IN ('coach', 'admin') 
        OR 'coach'::user_role = ANY(COALESCE(p.roles, ARRAY[p.role]))
        OR 'admin'::user_role = ANY(COALESCE(p.roles, ARRAY[p.role]))
      )
  )
)
WITH CHECK (
  public.get_user_role() IN ('coach', 'admin')
  OR 'admin' = ANY(public.get_user_roles())
  OR 'coach' = ANY(public.get_user_roles())
  OR EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() 
      AND (
        p.role IN ('coach', 'admin') 
        OR 'coach'::user_role = ANY(COALESCE(p.roles, ARRAY[p.role]))
        OR 'admin'::user_role = ANY(COALESCE(p.roles, ARRAY[p.role]))
      )
  )
);

-- 2. Tabela fields: garantir políticas para administradores e treinadores
ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Campos legíveis por todos" ON public.fields;
CREATE POLICY "Campos legíveis por todos" 
ON public.fields FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Apenas treinadores e admins gerem campos" ON public.fields;
CREATE POLICY "Apenas treinadores e admins gerem campos"
ON public.fields FOR ALL TO authenticated
USING (
  public.get_user_role() IN ('coach', 'admin')
  OR 'admin' = ANY(public.get_user_roles())
  OR 'coach' = ANY(public.get_user_roles())
  OR EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() 
      AND (
        p.role IN ('coach', 'admin') 
        OR 'coach'::user_role = ANY(COALESCE(p.roles, ARRAY[p.role]))
        OR 'admin'::user_role = ANY(COALESCE(p.roles, ARRAY[p.role]))
      )
  )
)
WITH CHECK (
  public.get_user_role() IN ('coach', 'admin')
  OR 'admin' = ANY(public.get_user_roles())
  OR 'coach' = ANY(public.get_user_roles())
  OR EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() 
      AND (
        p.role IN ('coach', 'admin') 
        OR 'coach'::user_role = ANY(COALESCE(p.roles, ARRAY[p.role]))
        OR 'admin'::user_role = ANY(COALESCE(p.roles, ARRAY[p.role]))
      )
  )
);

COMMIT;
