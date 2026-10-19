-- ============================================================================
-- LIMPEZA: Garantir confidencialidade de MVPs na tabela pública stats
-- ============================================================================
-- Como o apuramento de MVPs é de consulta confidencial e reservada
-- a Rui Mariano e Pedro Vieira exclusivamente no separador MVP,
-- a coluna is_mvp na tabela stats deve permanecer estritamente a false.
-- ============================================================================

UPDATE public.stats
SET is_mvp = false
WHERE is_mvp = true;
