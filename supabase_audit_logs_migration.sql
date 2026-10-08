-- ============================================================================
-- Migração: Sistema de Auditoria Completo (Audit Logs) para CSC
-- ============================================================================
--
-- Regista todas as alterações críticas na base de dados (criação, edição e remoção)
-- de forma imutável, automática e rastreável:
-- - Perfis / Plantel (profiles)
-- - Eventos / Jogos / Treinos (events)
-- - Convocatórias (callups)
-- - Comunicados (announcements)
-- - Quotas e Finanças (dues, transactions, charges, charge_payments)
-- - Configurações do Clube, Torneios, Adversários, Campos
--
-- CARACTERÍSTICAS DE SEGURANÇA:
-- 1. Registo automático via Trigger em PostgreSQL (funciona por API, app ou script).
-- 2. Guarda o utilizador autenticado (auth.uid()), nome, papel e email no momento do evento.
-- 3. Calcula o diff exato campo a campo nas atualizações (changes JSONB).
-- 4. RLS: Só a Direção (role = 'admin') pode ler o registo de auditoria.
-- 5. Imutabilidade (WORM): Ninguém (nem admins) pode atualizar ou apagar logs.
-- ============================================================================

-- 1. Tabela de logs de auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_name TEXT,
    user_email TEXT,
    user_role TEXT,
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    record_title TEXT,
    old_data JSONB,
    new_data JSONB,
    changes JSONB,
    description TEXT
);

-- Índices para pesquisa eficiente
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON public.audit_logs (record_id);

-- 2. Ativar RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Política de leitura: Apenas membros da Direção (admin) podem consultar
DROP POLICY IF EXISTS "Direcao pode consultar auditoria" ON public.audit_logs;
CREATE POLICY "Direcao pode consultar auditoria"
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (
        public.get_user_role() = 'admin'
        OR EXISTS (
            SELECT 1 FROM public.profiles
             WHERE profiles.id = auth.uid()
               AND (
                 profiles.role = 'admin'
                 OR ('admin'::public.user_role = ANY(COALESCE(profiles.roles, ARRAY[profiles.role])))
               )
        )
    );

-- Política de inserção: Permitir a utilizadores autenticados e triggers
DROP POLICY IF EXISTS "Permitir insercao de logs autenticados" ON public.audit_logs;
CREATE POLICY "Permitir insercao de logs autenticados"
    ON public.audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Nota: NÃO existem políticas de UPDATE ou DELETE.
-- Isto garante a imutabilidade do log contra adulteração.

-- 3. Função do gatilho de auditoria (PL/pgSQL)
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
    -- Identificar o utilizador que realizou a ação
    v_user_id := auth.uid();
    
    IF v_user_id IS NOT NULL THEN
        SELECT COALESCE(p.name, p.shirt_name, p.email, 'Utilizador'),
               p.email,
               p.role::text
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
            v_record_title := COALESCE(NEW.title, NEW.type);
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
            v_record_title := COALESCE(OLD.title, OLD.type);
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
            v_record_title := COALESCE(NEW.title, NEW.type);
            v_description := 'Atualizou evento: ' || COALESCE(v_record_title, v_record_id);
        ELSIF TG_TABLE_NAME = 'announcements' THEN
            v_record_title := NEW.title;
            v_description := 'Atualizou comunicado: ' || COALESCE(v_record_title, v_record_id);
        ELSIF TG_TABLE_NAME = 'callups' THEN
            v_record_title := 'Convocatória (atleta ' || COALESCE(NEW.player_id::text, '') || ')';
            v_description := 'Atualizou presença/convocatória';
        ELSIF TG_TABLE_NAME = 'dues' THEN
            v_record_title := 'Quota ' || COALESCE(NEW.month_year, '');
            v_description := 'Atualizou estado de quota (' || COALESCE(NEW.status, '') || ')';
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

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.process_audit_log() FROM PUBLIC, anon, authenticated;

-- 4. Instalar Triggers nas tabelas chave
DO $$
DECLARE
    t text;
    tabelas text[] := ARRAY[
        'profiles',
        'events',
        'callups',
        'announcements',
        'dues',
        'transactions',
        'charges',
        'charge_payments',
        'club_settings',
        'tournaments',
        'opponents',
        'fields'
    ];
BEGIN
    FOREACH t IN ARRAY tabelas LOOP
        -- Verificar se a tabela existe antes de criar o trigger
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I;', t, t);
            EXECUTE format('
                CREATE TRIGGER trg_audit_%I
                AFTER INSERT OR UPDATE OR DELETE ON public.%I
                FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
            ', t, t);
        END IF;
    END LOOP;
END;
$$;

-- 5. Função RPC para registo manual de auditoria via cliente (ex: autenticação, exportação)
CREATE OR REPLACE FUNCTION public.registar_auditoria_app(
    p_action TEXT,
    p_table_name TEXT,
    p_record_id TEXT,
    p_record_title TEXT,
    p_description TEXT,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_user_name TEXT;
    v_user_email TEXT;
    v_user_role TEXT;
    v_log_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NOT NULL THEN
        SELECT COALESCE(p.name, p.shirt_name, p.email, 'Utilizador'),
               p.email,
               p.role::text
          INTO v_user_name, v_user_email, v_user_role
          FROM public.profiles p
         WHERE p.id = v_user_id;
    END IF;

    INSERT INTO public.audit_logs (
        user_id,
        user_name,
        user_email,
        user_role,
        action,
        table_name,
        record_id,
        record_title,
        changes,
        description
    ) VALUES (
        v_user_id,
        COALESCE(v_user_name, 'Sistema'),
        v_user_email,
        v_user_role,
        p_action,
        p_table_name,
        p_record_id,
        p_record_title,
        p_details,
        p_description
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registar_auditoria_app(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
