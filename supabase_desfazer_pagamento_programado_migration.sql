-- Apagar a despesa de um Pagamento Programado desfaz o pagamento
-- ==============================================================
--
-- Pagar um encargo-intermediário (o Seguro Desportivo à seguradora) são duas
-- escritas: a despesa em `transactions` e a marca no encargo
-- (`payable_paid = true`, `payable_transaction_id` a apontar para a despesa).
-- Apagar a despesa só desfazia metade. A chave estrangeira é ON DELETE SET
-- NULL, por isso o `payable_transaction_id` ficava a NULL e o `payable_paid`
-- ficava true: o encargo dava-se por pago sem despesa nenhuma por trás.
--
-- Aconteceu a 2026-09-24 com o "Seguro desportivo 26/27": um toque na linha
-- em Despesas/Receitas lançou os 700 € (não havia confirmação), a despesa foi
-- apagada 23 segundos depois, e o seguro saiu dos Pagamentos Programados para
-- sempre. O formulário do encargo trancou o valor a pagar ("Já pago ao
-- terceiro"), e a Previsão da Época continuou a contar 700 € de saída que não
-- estavam em lado nenhum — nem por pagar, nem pagos.
--
-- As tranches de inscrição em torneio têm a mesma forma, com o estado dentro
-- de `tournaments.rules.registration_fee.installments[]`, e tinham o mesmo
-- defeito.
--
-- Fica num gatilho e não no cliente porque o "pago" é consequência de a
-- despesa existir: seja qual for o caminho por onde ela sai — o caixote da
-- app, o painel do Supabase —, o pagamento volta a estar por fazer, na mesma
-- transação. No cliente seriam duas escritas, e foi uma escrita a meio que
-- deixou o seguro assim.
--
-- SECURITY DEFINER para a regra valer seja quem for que apague: hoje só a
-- direção apaga despesas e só a direção mexe em encargos, mas se a RLS de
-- `transactions` se abrir a mais alguém, um UPDATE barrado pela RLS de
-- `charges` não daria erro nenhum — passaria a não fazer nada, calado, e o
-- defeito voltava. O gatilho só toca nas linhas que apontam para a despesa
-- que está a ser apagada, e quem a pode apagar pode desfazer o que ela fez.

CREATE OR REPLACE FUNCTION public.transactions_desfazer_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Encargo-intermediário pago com esta despesa.
  UPDATE public.charges
     SET payable_paid = false,
         payable_transaction_id = NULL
   WHERE payable_transaction_id = OLD.id;

  -- Tranche de inscrição em torneio paga com esta despesa. A ligação é o
  -- `transaction_id` guardado na própria tranche, e não o `installment_index`
  -- da despesa: mudar o número de tranches redistribui o plano e mexe nos
  -- índices.
  UPDATE public.tournaments t
     SET rules = jsonb_set(
           t.rules,
           '{registration_fee,installments}',
           (SELECT jsonb_agg(
                     CASE WHEN tranche->>'transaction_id' = OLD.id::text
                          THEN (tranche - 'transaction_id') || jsonb_build_object('paid', false)
                          ELSE tranche
                     END
                     ORDER BY n)
              FROM jsonb_array_elements(t.rules #> '{registration_fee,installments}')
                   WITH ORDINALITY AS a(tranche, n)))
   WHERE t.rules #> '{registration_fee,installments}'
         @> jsonb_build_array(jsonb_build_object('transaction_id', OLD.id::text));

  RETURN OLD;
END;
$$;

-- Gatilho, e não RPC: sai da API dos dois lados. Os *default privileges* deste
-- schema dão EXECUTE a `anon` e `authenticated` em toda a função nova — ver a
-- lição do ponto 2 dos riscos no CLAUDE.md.
REVOKE ALL ON FUNCTION public.transactions_desfazer_pagamento() FROM PUBLIC, anon, authenticated;

-- BEFORE e não AFTER: depois de apagada a despesa, a chave estrangeira já pôs
-- o `payable_transaction_id` a NULL e o encargo deixava de se encontrar.
DROP TRIGGER IF EXISTS transactions_desfazer_pagamento ON public.transactions;
CREATE TRIGGER transactions_desfazer_pagamento
  BEFORE DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.transactions_desfazer_pagamento();
