-- ============================================================================
-- SCRIPT DE TESTE: DISPARAR NOTIFICAÇÃO DE VOTAÇÃO MVP PARA RUI MARIANO
-- ============================================================================
-- Executa este script no SQL Editor do Supabase para preparar o reenvio da
-- notificação de votação MVP especificamente para o teu utilizador.
-- ============================================================================

-- 1. Remove qualquer voto registado por Rui Mariano para o último jogo,
--    de modo a colocar o estado como "pendente" (não votou):
DELETE FROM public.mvp_votes
WHERE voter_id IN (
    SELECT id FROM public.profiles WHERE email = 'rpmariano@gmail.com'
);

-- 2. Limpa o registo de avisos push já entregues do tipo 'voto_mvp' para Rui Mariano,
--    permitindo que o sistema volte a emitir o aviso push:
DELETE FROM public.avisos_enviados
WHERE profile_id IN (
    SELECT id FROM public.profiles WHERE email = 'rpmariano@gmail.com'
) AND tipo = 'voto_mvp';

-- 3. Inspeciona a fila de avisos pendentes:
--    Deverá listar a linha do aviso de MVP pronta para entrega a Rui Mariano.
SELECT * FROM public.avisos_pendentes()
WHERE profile_id IN (
    SELECT id FROM public.profiles WHERE email = 'rpmariano@gmail.com'
);
