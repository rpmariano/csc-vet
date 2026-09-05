-- Encargos em que o clube funciona como intermediário — recebe dos jogadores
-- (ex.: Seguro Desportivo) mas depois tem de repassar o valor acordado a um
-- terceiro (a seguradora). Um encargo destes passa a ter, além do que já
-- cobra aos jogadores, um valor a pagar a esse terceiro — que entra logo na
-- previsão financeira como um pagamento programado, mesmo antes de ser pago.
--
-- Um único valor + prazo (não um plano de tranches, ao contrário da inscrição
-- de torneio): cobre o caso comum (Seguro Desportivo → seguradora, valor
-- único anual) sem complicar a configuração do encargo com um plano de
-- pagamentos completo.

ALTER TABLE public.charges
    ADD COLUMN IF NOT EXISTS is_intermediary BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS payable_amount NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS payable_due_date DATE,
    ADD COLUMN IF NOT EXISTS payable_paid BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS payable_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.charges.is_intermediary IS
'O clube recebe este encargo dos jogadores mas tem de repassar o valor (ou parte dele) a um terceiro — ex.: Seguro Desportivo pago à seguradora. Quando true, payable_amount/payable_due_date descrevem esse pagamento.';
COMMENT ON COLUMN public.charges.payable_amount IS
'Quanto o clube tem de pagar ao terceiro — pode diferir do total cobrado aos jogadores (amount × participantes).';
COMMENT ON COLUMN public.charges.payable_transaction_id IS
'A despesa (transactions) que liquidou este pagamento, à semelhança de tournaments.rules.registration_fee.installments[].transaction_id.';

CREATE INDEX IF NOT EXISTS idx_charges_payable_pending ON public.charges (payable_due_date) WHERE is_intermediary AND NOT payable_paid;
