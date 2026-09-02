-- ============================================================================
-- Fecha a leitura da tabela `profiles`
-- ============================================================================
--
-- Problema: a política `Permitir gestão de perfis` era FOR ALL ... USING (true)
-- para `authenticated`. As políticas permissivas do Postgres somam-se por OR,
-- por isso essa bastava sozinha para dar SELECT, INSERT, UPDATE e DELETE de
-- todas as linhas a qualquer conta autenticada — e tornava decorativas as duas
-- políticas restritivas que já existiam ao lado dela:
--
--   "Ficha completa: só o próprio e a equipa técnica"  (SELECT)
--   "Utilizador pode editar o seu próprio perfil"       (UPDATE)
--
-- A tabela guarda IBAN, NIF, nº de cartão de cidadão, morada, telefone, data de
-- nascimento e notas médicas de todo o plantel: uma conta no clube chegava para
-- descarregar tudo.
--
-- Esta migração apaga a política permissiva e repõe, uma a uma, as permissões
-- que a app precisa de facto. Depois dela:
--
--   SELECT  — a própria ficha, as fichas com o email da própria conta, e tudo
--             para treinador/admin
--   INSERT  — a própria ficha, ou qualquer uma para treinador/admin
--   UPDATE  — a própria ficha (sem poder mexer em `role`/`roles`), ou qualquer
--             uma para treinador/admin
--   DELETE  — só treinador/admin, mais as fichas soltas com o email da própria
--             conta (usadas no primeiro início de sessão, ao juntar a ficha de
--             atleta à conta acabada de criar)
--
-- `get_user_role()` é SECURITY DEFINER com search_path fixo, portanto lê
-- `profiles` sem passar pela RLS: não há recursão.
--
-- Idempotente: pode correr mais do que uma vez.
-- ============================================================================

BEGIN;

-- 1. A política que anulava todas as outras.
DROP POLICY IF EXISTS "Permitir gestão de perfis" ON public.profiles;

-- 2. SELECT ------------------------------------------------------------------
-- A ficha própria e a equipa técnica (já existia; recriada para a migração
-- ficar completa e poder correr num projeto novo).
DROP POLICY IF EXISTS "Ficha completa: só o próprio e a equipa técnica" ON public.profiles;
CREATE POLICY "Ficha completa: só o próprio e a equipa técnica"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR public.get_user_role() IN ('coach', 'admin')
);

-- No primeiro início de sessão, a conta ainda não está ligada à ficha de atleta
-- (a ficha tem outro id). O que as liga é o email: esta política deixa cada um
-- ver as fichas que têm o email da sua própria conta, e mais nenhuma.
DROP POLICY IF EXISTS "Fichas com o email da minha conta" ON public.profiles;
CREATE POLICY "Fichas com o email da minha conta"
ON public.profiles FOR SELECT TO authenticated
USING (
  email IS NOT NULL
  AND lower(email) = lower(NULLIF(auth.jwt() ->> 'email', ''))
);

-- 3. INSERT ------------------------------------------------------------------
-- Cada um pode criar a sua própria ficha (o AuthContext cria-a no primeiro
-- início de sessão); a equipa técnica cria fichas de qualquer membro no Plantel.
DROP POLICY IF EXISTS "Criar a própria ficha ou, sendo equipa técnica, qualquer uma" ON public.profiles;
CREATE POLICY "Criar a própria ficha ou, sendo equipa técnica, qualquer uma"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = id
  OR public.get_user_role() IN ('coach', 'admin')
);

-- 4. UPDATE ------------------------------------------------------------------
-- A própria ficha, sem poder promover-se: `role` e `roles` têm de ficar iguais
-- aos que a conta já tem (já existia; recriada por completude).
DROP POLICY IF EXISTS "Utilizador pode editar o seu próprio perfil" ON public.profiles;
CREATE POLICY "Utilizador pode editar o seu próprio perfil"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND role = public.get_user_role()
  AND roles IS NOT DISTINCT FROM public.get_user_roles()
);

-- A equipa técnica edita qualquer ficha — é o que o Plantel faz.
DROP POLICY IF EXISTS "Equipa técnica edita qualquer ficha" ON public.profiles;
CREATE POLICY "Equipa técnica edita qualquer ficha"
ON public.profiles FOR UPDATE TO authenticated
USING (public.get_user_role() IN ('coach', 'admin'))
WITH CHECK (public.get_user_role() IN ('coach', 'admin'));

-- 5. DELETE ------------------------------------------------------------------
-- A equipa técnica apaga fichas no Plantel. Cada um pode apagar as fichas
-- soltas com o email da sua conta: é o que acontece ao juntar a ficha de atleta
-- à conta no primeiro início de sessão, quando sobra um registo duplicado.
DROP POLICY IF EXISTS "Apagar fichas: equipa técnica, ou as do meu email" ON public.profiles;
CREATE POLICY "Apagar fichas: equipa técnica, ou as do meu email"
ON public.profiles FOR DELETE TO authenticated
USING (
  public.get_user_role() IN ('coach', 'admin')
  OR (
    email IS NOT NULL
    AND lower(email) = lower(NULLIF(auth.jwt() ->> 'email', ''))
  )
);

COMMIT;

-- ============================================================================
-- Depois de correr, confirmar que ficaram exatamente estas seis políticas e
-- nenhuma com `qual = true`:
--
--   select policyname, cmd, qual, with_check
--   from pg_policies where tablename = 'profiles' and schemaname = 'public'
--   order by cmd, policyname;
-- ============================================================================
