-- ============================================================================
-- MIGRAÇÃO: VOTAÇÃO MVP ABERTA A TODOS OS UTILIZADORES E ADEPTOS DA APP
-- ============================================================================
-- Abre a possibilidade de votar no MVP a todos os utilizadores autenticados
-- (jogadores convocados, não convocados, equipa técnica, direção e adeptos).
-- Mantém a integridade: 1 voto por utilizador por jogo (com 2 atletas distintos),
-- apenas sobre o seu próprio voter_id.
-- ============================================================================

-- 1. Atualizar RLS de inserção em public.mvp_votes
DROP POLICY IF EXISTS "Utilizador regista o seu próprio voto MVP" ON public.mvp_votes;
CREATE POLICY "Utilizador regista o seu próprio voto MVP"
ON public.mvp_votes FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = voter_id
);

-- 2. Imutabilidade do voto: uma vez submetido o voto, fica estritamente bloqueado contra alteração
DROP POLICY IF EXISTS "Utilizador altera o seu próprio voto MVP" ON public.mvp_votes;
-- Não existe política de UPDATE para utilizadores comuns: o voto é imutável após ser inserido

-- 3. Garantir permissões de leitura a utilizadores autenticados
DROP POLICY IF EXISTS "Votos MVP legíveis por utilizadores autenticados" ON public.mvp_votes;
CREATE POLICY "Votos MVP legíveis por utilizadores autenticados"
ON public.mvp_votes FOR SELECT
TO authenticated
USING (true);
