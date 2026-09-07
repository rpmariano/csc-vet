-- Quando é que o atleta respondeu à convocatória.
--
-- O ecrã 4a do handoff escreve "Confirmou presença · ontem, 21:14", e não
-- havia como saber a hora: `callups.created_at` é de quando a pessoa foi
-- convocada, não de quando respondeu.
--
-- A hora é preenchida por um gatilho e não pelo cliente. A política de UPDATE
-- desta tabela deixa o jogador escrever a sua própria linha
-- ("Jogadores confirmam ou recusam a sua convocatória"), e o `WITH CHECK` só
-- olha para o `status` — uma hora enviada pelo cliente era uma hora que
-- qualquer pessoa podia falsificar. Num BEFORE trigger o valor é escrito no
-- servidor e o WITH CHECK avalia a linha já corrigida.
--
-- As 9 respostas que existem hoje ficam com `responded_at` a NULL: não há
-- forma de saber quando foram dadas, e inventar uma data era pior do que não
-- ter nenhuma. A UI tem de aguentar a hora em falta.

alter table public.callups
  add column if not exists responded_at timestamptz;

comment on column public.callups.responded_at is
  'Instante em que o atleta confirmou ou recusou. Preenchido pelo gatilho '
  'callups_marcar_resposta, nunca pelo cliente. NULL enquanto não houver '
  'resposta, e nas respostas anteriores a esta migração.';

create or replace function public.callups_marcar_resposta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Um jogador pode inserir a sua resposta diretamente (é o que acontece
    -- quando responde a um evento para o qual ainda não tinha linha).
    if new.status in ('confirmed', 'declined') then
      new.responded_at := now();
    else
      new.responded_at := null;
    end if;
    return new;
  end if;

  -- UPDATE: só mexe quando o estado muda mesmo. Editar as notas de uma
  -- convocatória não é responder outra vez.
  if new.status is distinct from old.status then
    if new.status in ('confirmed', 'declined') then
      new.responded_at := now();
    else
      -- Repor "sem resposta" limpa a hora: senão ficava a dizer que respondeu
      -- num instante em que já não há resposta nenhuma.
      new.responded_at := null;
    end if;
  end if;

  return new;
end;
$$;

-- Gatilho e não RPC: sai da API dos dois lados. Ver a lição do ponto 7 dos
-- riscos no CLAUDE.md — o Postgres concede EXECUTE a PUBLIC em toda a função
-- nova, e `anon` herda de lá.
revoke all on function public.callups_marcar_resposta() from public;
revoke all on function public.callups_marcar_resposta() from anon, authenticated;

drop trigger if exists callups_marcar_resposta on public.callups;

create trigger callups_marcar_resposta
  before insert or update on public.callups
  for each row
  execute function public.callups_marcar_resposta();
