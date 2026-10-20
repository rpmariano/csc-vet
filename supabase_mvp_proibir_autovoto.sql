-- ============================================================================
-- MIGRAÇÃO: PROIBIR AUTOVOTO NA ELEIÇÃO DE MVP
-- ============================================================================
-- Regra: Nenhum jogador pode votar em si próprio (nem para 1º nem para 2º lugar).
-- ============================================================================

-- 1. Atualizar RLS de inserção em public.mvp_votes para bloquear autovoto
DROP POLICY IF EXISTS "Utilizador regista o seu próprio voto MVP" ON public.mvp_votes;
CREATE POLICY "Utilizador regista o seu próprio voto MVP"
ON public.mvp_votes FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = voter_id
    AND voter_id <> player1_id
    AND voter_id <> player2_id
);

-- 2. Adicionar restrição CHECK à tabela mvp_votes (com NOT VALID para compatibilidade com dados existentes)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'mvp_votes_no_self_vote'
    ) THEN
        ALTER TABLE public.mvp_votes
        ADD CONSTRAINT mvp_votes_no_self_vote
        CHECK (voter_id <> player1_id AND voter_id <> player2_id) NOT VALID;
    END IF;
END $$;
