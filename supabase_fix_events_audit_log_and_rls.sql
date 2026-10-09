-- ============================================================================
-- Migração: Correção do gatilho de auditoria (process_audit_log) e RLS de eventos
-- ============================================================================
-- Contexto:
-- 1. Ao atualizar, criar ou apagar eventos (events), o gatilho trg_audit_events
--    invocava process_audit_log(), que executava:
--      v_record_title := COALESCE(NEW.title, NEW.type);
--    Como `title` é VARCHAR e `type` é um ENUM (public.event_type), o PostgreSQL
--    falhava com erro 42804 (COALESCE types character varying and event_type cannot be matched),
--    impedindo a gravação de qualquer alteração a eventos.
-- 2. O mesmo ocorria na tabela `dues` com COALESCE(NEW.status, '') (due_status enum vs text).
-- 3. As conversões explícitas para ::text foram adicionadas e toda a função
--    process_audit_log() foi protegida com um bloco EXCEPTION WHEN OTHERS,
--    garantindo que qualquer anomalia de auditoria nunca bloqueia a operação de negócio.
-- 4. As políticas RLS de `events`, `callups` e `tournament_matches` foram
--    reforçadas para verificar 'admin' = ANY(get_user_roles()) e 'coach' = ANY(get_user_roles()).
-- ============================================================================

BEGIN;

-- 1. Corrigir função process_audit_log()
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_user_name TEXT;
    v_user_email TEXT;
    v_user_role TEXT;
    v_record_id TEXT;
    v_record_title TEXT;
    v_old_json JSONB := NULL;
    v_new_json JSONB := NULL;
    v_changes JSONB := '{}'::jsonb;
    v_key TEXT;
    v_old_val JSONB;
    v_new_val JSONB;
    v_action TEXT;
    v_description TEXT;
BEGIN
    BEGIN
        -- Identificar o utilizador que realizou a ação
        v_user_id := auth.uid();
        
        IF v_user_id IS NOT NULL THEN
            SELECT COALESCE(p.name, p.shirt_name, p.email, 'Utilizador'),
                   p.email,
                   COALESCE(public.get_user_role()::text, p.role::text, 'player')
              INTO v_user_name, v_user_email, v_user_role
              FROM public.profiles p
             WHERE p.id = v_user_id;
        END IF;

        -- Caso o registo seja feito pelo sistema ou anónimo
        IF v_user_name IS NULL THEN
            v_user_name := 'Sistema';
        END IF;

        IF TG_OP = 'INSERT' THEN
            v_action := 'INSERT';
            v_new_json := to_jsonb(NEW);
            v_record_id := COALESCE(v_new_json->>'id', 'id');

            -- Títulos amigáveis por tabela
            IF TG_TABLE_NAME = 'profiles' THEN
                v_record_title := COALESCE(NEW.name, NEW.shirt_name, NEW.email);
                v_description := 'Criou perfil de ' || COALESCE(v_record_title, v_record_id);
            ELSIF TG_TABLE_NAME = 'events' THEN
                v_record_title := COALESCE(NEW.title, NEW.type::text);
                v_description := 'Criou evento: ' || COALESCE(v_record_title, v_record_id);
            ELSIF TG_TABLE_NAME = 'announcements' THEN
                v_record_title := NEW.title;
                v_description := 'Publicou comunicado: ' || COALESCE(v_record_title, v_record_id);
            ELSIF TG_TABLE_NAME = 'callups' THEN
                v_record_title := 'Convocatória (atleta ' || COALESCE(NEW.player_id::text, '') || ')';
                v_description := 'Adicionou atleta à convocatória';
            ELSIF TG_TABLE_NAME = 'transactions' THEN
                v_record_title := COALESCE(NEW.description, 'Transação');
                v_description := 'Criou transação de ' || COALESCE(NEW.amount::text, '0') || '€';
            ELSIF TG_TABLE_NAME = 'dues' THEN
                v_record_title := 'Quota ' || COALESCE(NEW.month_year, '');
                v_description := 'Criou quota ' || COALESCE(NEW.month_year, '');
            ELSIF TG_TABLE_NAME = 'charges' THEN
                v_record_title := NEW.title;
                v_description := 'Criou encargo: ' || COALESCE(NEW.title, '');
            ELSIF TG_TABLE_NAME = 'charge_payments' THEN
                v_record_title := 'Pagamento de encargo';
                v_description := 'Registou pagamento de ' || COALESCE(NEW.amount::text, '0') || '€';
            ELSIF TG_TABLE_NAME = 'tournaments' THEN
                v_record_title := NEW.name;
                v_description := 'Criou torneio: ' || COALESCE(NEW.name, '');
            ELSIF TG_TABLE_NAME = 'opponents' THEN
                v_record_title := NEW.name;
                v_description := 'Criou adversário: ' || COALESCE(NEW.name, '');
            ELSIF TG_TABLE_NAME = 'fields' THEN
                v_record_title := NEW.name;
                v_description := 'Criou campo: ' || COALESCE(NEW.name, '');
            ELSE
                v_record_title := TG_TABLE_NAME || ' #' || v_record_id;
                v_description := 'Criou registo em ' || TG_TABLE_NAME;
            END IF;

            v_changes := v_new_json;

        ELSIF TG_OP = 'DELETE' THEN
            v_action := 'DELETE';
            v_old_json := to_jsonb(OLD);
            v_record_id := COALESCE(v_old_json->>'id', 'id');

            IF TG_TABLE_NAME = 'profiles' THEN
                v_record_title := COALESCE(OLD.name, OLD.shirt_name, OLD.email);
                v_description := 'Eliminou perfil de ' || COALESCE(v_record_title, v_record_id);
            ELSIF TG_TABLE_NAME = 'events' THEN
                v_record_title := COALESCE(OLD.title, OLD.type::text);
                v_description := 'Eliminou evento: ' || COALESCE(v_record_title, v_record_id);
            ELSIF TG_TABLE_NAME = 'announcements' THEN
                v_record_title := OLD.title;
                v_description := 'Eliminou comunicado: ' || COALESCE(v_record_title, v_record_id);
            ELSIF TG_TABLE_NAME = 'callups' THEN
                v_record_title := 'Convocatória (atleta ' || COALESCE(OLD.player_id::text, '') || ')';
                v_description := 'Removeu atleta da convocatória';
            ELSIF TG_TABLE_NAME = 'transactions' THEN
                v_record_title := COALESCE(OLD.description, 'Transação');
                v_description := 'Eliminou transação de ' || COALESCE(OLD.amount::text, '0') || '€';
            ELSIF TG_TABLE_NAME = 'charges' THEN
                v_record_title := OLD.title;
                v_description := 'Eliminou encargo: ' || COALESCE(OLD.title, '');
            ELSE
                v_record_title := TG_TABLE_NAME || ' #' || v_record_id;
                v_description := 'Eliminou registo de ' || TG_TABLE_NAME;
            END IF;

            v_changes := v_old_json;

        ELSIF TG_OP = 'UPDATE' THEN
            v_action := 'UPDATE';
            v_old_json := to_jsonb(OLD);
            v_new_json := to_jsonb(NEW);
            v_record_id := COALESCE(v_new_json->>'id', 'id');

            -- Calcular diferenças entre campos
            FOR v_key IN SELECT jsonb_object_keys(v_new_json) LOOP
                -- Ignorar updated_at
                IF v_key IN ('updated_at') THEN
                    CONTINUE;
                END IF;

                v_old_val := v_old_json->v_key;
                v_new_val := v_new_json->v_key;

                IF v_old_val IS DISTINCT FROM v_new_val THEN
                    v_changes := jsonb_set(
                        v_changes,
                        ARRAY[v_key],
                        jsonb_build_object('antigo', v_old_val, 'novo', v_new_val)
                    );
                END IF;
            END LOOP;

            -- Se nenhuma alteração substancial ocorreu, ignora
            IF v_changes = '{}'::jsonb THEN
                RETURN NEW;
            END IF;

            IF TG_TABLE_NAME = 'profiles' THEN
                v_record_title := COALESCE(NEW.name, NEW.shirt_name, NEW.email);
                v_description := 'Atualizou perfil de ' || COALESCE(v_record_title, v_record_id);
            ELSIF TG_TABLE_NAME = 'events' THEN
                v_record_title := COALESCE(NEW.title, NEW.type::text);
                v_description := 'Atualizou evento: ' || COALESCE(v_record_title, v_record_id);
            ELSIF TG_TABLE_NAME = 'announcements' THEN
                v_record_title := NEW.title;
                v_description := 'Atualizou comunicado: ' || COALESCE(v_record_title, v_record_id);
            ELSIF TG_TABLE_NAME = 'callups' THEN
                v_record_title := 'Convocatória (atleta ' || COALESCE(NEW.player_id::text, '') || ')';
                v_description := 'Atualizou presença/convocatória';
            ELSIF TG_TABLE_NAME = 'dues' THEN
                v_record_title := 'Quota ' || COALESCE(NEW.month_year, '');
                v_description := 'Atualizou estado de quota (' || COALESCE(NEW.status::text, '') || ')';
            ELSIF TG_TABLE_NAME = 'transactions' THEN
                v_record_title := COALESCE(NEW.description, 'Transação');
                v_description := 'Atualizou transação (' || COALESCE(NEW.amount::text, '0') || '€)';
            ELSIF TG_TABLE_NAME = 'charges' THEN
                v_record_title := NEW.title;
                v_description := 'Atualizou encargo: ' || COALESCE(NEW.title, '');
            ELSIF TG_TABLE_NAME = 'club_settings' THEN
                v_record_title := COALESCE(NEW.name, 'Dados do Clube');
                v_description := 'Atualizou configurações do clube';
            ELSE
                v_record_title := TG_TABLE_NAME || ' #' || v_record_id;
                v_description := 'Atualizou registo em ' || TG_TABLE_NAME;
            END IF;

        END IF;

        -- Gravar entrada imutável no log de auditoria
        INSERT INTO public.audit_logs (
            user_id,
            user_name,
            user_email,
            user_role,
            action,
            table_name,
            record_id,
            record_title,
            old_data,
            new_data,
            changes,
            description
        ) VALUES (
            v_user_id,
            v_user_name,
            v_user_email,
            v_user_role,
            v_action,
            TG_TABLE_NAME,
            v_record_id,
            v_record_title,
            v_old_json,
            v_new_json,
            v_changes,
            v_description
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- Nunca impedir uma operação de negócio legítima por falha não-crítica no log
            RAISE WARNING 'Falha não-bloqueante no registo de auditoria para tabela %: % (SQLSTATE %)', TG_TABLE_NAME, SQLERRM, SQLSTATE;
    END;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.process_audit_log() FROM PUBLIC, anon, authenticated;

-- 2. Reforçar políticas RLS de EVENTS
DROP POLICY IF EXISTS "Apenas treinadores e admins gerem eventos" ON public.events;
CREATE POLICY "Apenas treinadores e admins gerem eventos"
ON public.events FOR ALL
TO authenticated
USING (
    public.get_user_role() IN ('coach', 'admin')
    OR 'admin' = ANY(public.get_user_roles())
    OR 'coach' = ANY(public.get_user_roles())
)
WITH CHECK (
    public.get_user_role() IN ('coach', 'admin')
    OR 'admin' = ANY(public.get_user_roles())
    OR 'coach' = ANY(public.get_user_roles())
);

-- 3. Reforçar políticas RLS de CALLUPS
DROP POLICY IF EXISTS "Treinadores e admins inserem convocatórias" ON public.callups;
CREATE POLICY "Treinadores e admins inserem convocatórias"
ON public.callups FOR INSERT
TO authenticated
WITH CHECK (
    public.get_user_role() IN ('coach', 'admin')
    OR 'admin' = ANY(public.get_user_roles())
    OR 'coach' = ANY(public.get_user_roles())
);

DROP POLICY IF EXISTS "Treinadores e admins atualizam convocatórias" ON public.callups;
CREATE POLICY "Treinadores e admins atualizam convocatórias"
ON public.callups FOR UPDATE
TO authenticated
USING (
    public.get_user_role() IN ('coach', 'admin')
    OR 'admin' = ANY(public.get_user_roles())
    OR 'coach' = ANY(public.get_user_roles())
)
WITH CHECK (
    public.get_user_role() IN ('coach', 'admin')
    OR 'admin' = ANY(public.get_user_roles())
    OR 'coach' = ANY(public.get_user_roles())
);

DROP POLICY IF EXISTS "Treinadores e admins eliminam convocatórias" ON public.callups;
CREATE POLICY "Treinadores e admins eliminam convocatórias"
ON public.callups FOR DELETE
TO authenticated
USING (
    public.get_user_role() IN ('coach', 'admin')
    OR 'admin' = ANY(public.get_user_roles())
    OR 'coach' = ANY(public.get_user_roles())
);

-- 4. Reforçar políticas RLS de TOURNAMENT_MATCHES
DROP POLICY IF EXISTS "Treinadores e admins gerem jogos de torneio" ON public.tournament_matches;
CREATE POLICY "Treinadores e admins gerem jogos de torneio"
ON public.tournament_matches FOR ALL
TO authenticated
USING (
    public.get_user_role() IN ('coach', 'admin')
    OR 'admin' = ANY(public.get_user_roles())
    OR 'coach' = ANY(public.get_user_roles())
)
WITH CHECK (
    public.get_user_role() IN ('coach', 'admin')
    OR 'admin' = ANY(public.get_user_roles())
    OR 'coach' = ANY(public.get_user_roles())
);

COMMIT;
