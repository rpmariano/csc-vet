-- `events.is_active`: o rascunho, que o cliente escrevia há meses para o vazio.
--
-- A app tem a funcionalidade inteira feita — botão "Guardar como rascunho", o
-- filtro "Rascunhos" na Gestão de Eventos, o aviso de que um rascunho não
-- avisa ninguém — e escrevia-a numa coluna que **nunca existiu nesta tabela**.
-- O `EventsPage` tem 32 referências a `is_active`, várias delas remendos que
-- apanham o erro do PostgREST (`column events.is_active does not exist`) e
-- repetem a escrita sem a coluna. Resultado: guardar como rascunho criava um
-- evento normal, e o toast dizia que tinha ficado em rascunho.
--
-- **E partia o alerta de convocatórias em falta.** O
-- `useEventosSemConvocatoria` pede `is_active` no `select`, o PostgREST recusa
-- a consulta inteira, o hook devolve lista vazia — e a faixa da Home nunca
-- aparecia, para evento nenhum. Foi assim que isto se descobriu: um jogo a
-- 16 de setembro sem ninguém convocado e nenhum aviso.
--
-- Não confundir com `events.status` (`agendado, concluído, adiado,
-- cancelado`), que é outra coisa: o estado do evento no calendário, não o de
-- publicado ou por publicar.
--
-- `DEFAULT TRUE` e `NOT NULL`: tudo o que existe hoje foi criado como evento a
-- sério, e é assim que a app o tem tratado — o cliente lia `undefined` e o
-- `is_active !== false` deixava passar.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.events.is_active IS
'Falso enquanto o evento for rascunho: só a equipa técnica o vê, ninguém é '
'avisado e não entra no alerta de convocatórias em falta. Não confundir com '
'`status`, que é o estado no calendário (agendado, concluído, adiado, '
'cancelado).';

-- A RLS da tabela não muda: leitura a qualquer autenticado, escrita a
-- coach/admin. Um rascunho é visível a quem o lê — o que o esconde é o
-- cliente, e o alerta é a única coisa que o filtra de propósito.
