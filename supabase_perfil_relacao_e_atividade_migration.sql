-- Relação do contacto de emergência, e a janela de atividade dos atletas
-- =====================================================================
--
-- 1. `profiles.emergency_contact_relation`
--
-- A relação com o contacto de emergência — "Cônjuge", "Pai", "Irmão" — vivia
-- dentro do nome, num campo único rotulado "Contacto de Emergência (Nome /
-- Relação)". Quem preenchia escrevia "Maria (esposa)" ou "Maria - esposa" ou
-- só "Maria", conforme o dia; e num acidente, quem lê a ficha precisa de saber
-- de imediato quem é a pessoa a quem vai ligar. Passa a coluna própria, com
-- uma lista fechada no formulário.
--
-- Fica anulável e sem valor por omissão: o que já lá está no nome não se
-- adivinha, e inventar uma relação para 27 fichas seria pior do que a deixar
-- por preencher.
--
-- 2. `quota_start_date` dos atletas que já cá estavam
--
-- A janela de quota nunca foi preenchida — a app inferia-a do estado do perfil
-- (ver `getPlayerQuotaMonths`). A direção fixou o início da atividade de quem
-- já cá estava em **2026-09-02**, o primeiro dia da época 2026/2027 no clube.
-- Só se preenche quem ainda não tem data: uma que já lá esteja foi posta à mão
-- e não se mexe.
--
-- A partir daqui as datas passam a ser escritas pela app: ao passar um atleta
-- a **Inativo** grava-se o fim; ao voltar a **Apto** ou **Lesionado**, grava-se
-- um novo início e limpa-se o fim.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT;

COMMENT ON COLUMN public.profiles.emergency_contact_relation IS
  'Relação com o contacto de emergência (Cônjuge, Pai, Mãe, Filho/a, Irmão/ã, Amigo/a, Outro).';

UPDATE public.profiles
   SET quota_start_date = DATE '2026-09-02'
 WHERE quota_start_date IS NULL
   AND (
     CASE
       WHEN roles IS NOT NULL AND COALESCE(array_length(roles, 1), 0) > 0
         THEN ('player'::user_role = ANY (roles)) OR role = 'player'::user_role
       ELSE true
     END
   );
