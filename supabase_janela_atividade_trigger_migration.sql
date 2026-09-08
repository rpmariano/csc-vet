-- A janela de atividade escreve-se sozinha, a partir do estado
-- =============================================================
--
-- Regra da direção: o fim de atividade marca-se quando o atleta passa a
-- **Inativo**; se voltar a estar ativo, o início é atualizado e o fim é
-- limpo. Um atleta novo começa a contar no dia em que a ficha é criada.
--
-- Fica num gatilho e não no cliente porque é uma regra sobre os dados, não
-- sobre um ecrã: o estado é escrito no formulário do Plantel, mas também pelo
-- botão de "Marcar lesionado" da ficha, e amanhã por outro sítio qualquer.
-- No cliente, a primeira dessas escritas que se esquecesse da regra deixava a
-- janela errada e ninguém dava por isso — a quota é calculada a partir dela.
--
-- **Uma data escrita à mão ganha sempre.** O gatilho só preenche quando o
-- próprio UPDATE não mexe na data: se o admin puser o estado a Inativo e
-- escrever ele mesmo o fim de atividade, é o dele que fica. É por isso que a
-- condição compara `NEW` com `OLD` em vez de olhar só para o estado.
--
-- 'injured' conta como ativo: um lesionado continua sócio e continua a pagar
-- quota. O que interrompe a janela é sair do plantel.

CREATE OR REPLACE FUNCTION public.profiles_janela_de_atividade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.quota_start_date IS NULL AND NEW.status IS DISTINCT FROM 'inactive' THEN
      NEW.quota_start_date := CURRENT_DATE;
    END IF;
    RETURN NEW;
  END IF;

  -- Só quando o estado muda mesmo.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'inactive' THEN
    -- Saiu do plantel: fecha a janela, a não ser que o próprio UPDATE traga
    -- uma data de fim escrita à mão.
    IF NEW.quota_end_date IS NOT DISTINCT FROM OLD.quota_end_date THEN
      NEW.quota_end_date := CURRENT_DATE;
    END IF;

  ELSIF OLD.status = 'inactive' THEN
    -- Voltou: recomeça a contar hoje e a janela reabre.
    IF NEW.quota_start_date IS NOT DISTINCT FROM OLD.quota_start_date THEN
      NEW.quota_start_date := CURRENT_DATE;
    END IF;
    IF NEW.quota_end_date IS NOT DISTINCT FROM OLD.quota_end_date THEN
      NEW.quota_end_date := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Gatilho, e não RPC: sai da API dos dois lados. Os *default privileges* deste
-- schema dão EXECUTE a `anon` e `authenticated` em toda a função nova — ver a
-- lição do ponto 2 dos riscos no CLAUDE.md.
REVOKE ALL ON FUNCTION public.profiles_janela_de_atividade() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_janela_de_atividade ON public.profiles;
CREATE TRIGGER profiles_janela_de_atividade
  BEFORE INSERT OR UPDATE OF status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_janela_de_atividade();
