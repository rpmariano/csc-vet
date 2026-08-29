-- Schema de Base de Dados para Gestão de Equipa de Futebol de Veteranos

-- 1. ENUM para Perfis / Roles
CREATE TYPE user_role AS ENUM ('player', 'coach', 'admin');
CREATE TYPE event_type AS ENUM ('practice', 'match', 'gathering');
CREATE TYPE callup_status AS ENUM ('called', 'confirmed', 'declined');
CREATE TYPE due_status AS ENUM ('pending', 'paid', 'late');
CREATE TYPE transaction_type AS ENUM ('income', 'expense');

CREATE TYPE tournament_status AS ENUM ('agendado', 'ativo', 'terminado');
CREATE TYPE event_status AS ENUM ('agendado', 'concluído', 'adiado', 'cancelado');
CREATE TYPE match_location_type AS ENUM ('home', 'away', 'neutral');

-- 2. Tabela de Perfis (perfis de atletas, equipa técnica e dirigentes)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    nickname TEXT,
    shirt_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    photo_url TEXT,
    role user_role NOT NULL DEFAULT 'player',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'injured')),
    jersey_number INTEGER,
    kit_size TEXT,
    birth_date DATE,
    nationality TEXT DEFAULT 'Portuguesa',
    position TEXT,
    address TEXT,
    postal_code TEXT,
    city TEXT,
    nif TEXT,
    id_number TEXT,
    id_card_expiry DATE,
    iban TEXT,
    gdpr_consent BOOLEAN DEFAULT TRUE,
    member_number TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    medical_notes TEXT,
    id_document_url TEXT,
    insurance_doc_url TEXT,
    medical_exam_doc_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar RLS em profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Tabela de Campos/Estádios
CREATE TABLE IF NOT EXISTS public.fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;

-- Tabela de Adversários
CREATE TABLE IF NOT EXISTS public.opponents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    initials TEXT,
    logo_url TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    home_field_id UUID REFERENCES public.fields(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.opponents ENABLE ROW LEVEL SECURITY;

-- Tabela de Torneios
CREATE TABLE IF NOT EXISTS public.tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    season TEXT,
    status tournament_status NOT NULL DEFAULT 'agendado',
    rules JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Tabela de Jogadores Inscritos no Torneio (Plantel do Torneio)
CREATE TABLE IF NOT EXISTS public.tournament_players (
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (tournament_id, player_id)
);
ALTER TABLE public.tournament_players ENABLE ROW LEVEL SECURITY;

-- Tabela de Suspensões do Torneio
CREATE TABLE IF NOT EXISTS public.tournament_suspensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.tournament_suspensions ENABLE ROW LEVEL SECURITY;

-- 3. Tabela de Eventos
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    type event_type NOT NULL,
    date_time TIMESTAMP WITH TIME ZONE NOT NULL,
    meeting_time TIME,
    field_id UUID REFERENCES public.fields(id) ON DELETE SET NULL,
    description TEXT,
    status event_status NOT NULL DEFAULT 'agendado',
    related_gathering_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    is_friendly BOOLEAN DEFAULT FALSE,
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
    opponent_id UUID REFERENCES public.opponents(id) ON DELETE SET NULL,
    home_away match_location_type,
    home_score INTEGER,
    away_score INTEGER,
    max_players INTEGER,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar RLS em events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 4. Tabela de Convocatórias
CREATE TABLE IF NOT EXISTS public.callups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status callup_status NOT NULL DEFAULT 'called',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(event_id, player_id)
);

-- Habilitar RLS em callups
ALTER TABLE public.callups ENABLE ROW LEVEL SECURITY;

-- 5. Tabela de Presenças em Treinos
CREATE TABLE IF NOT EXISTS public.attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    present BOOLEAN NOT NULL DEFAULT FALSE,
    excuse_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(event_id, player_id)
);

-- Habilitar RLS em attendances
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

-- 6. Tabela de Estatísticas por Jogo
CREATE TABLE IF NOT EXISTS public.stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    goals INTEGER NOT NULL DEFAULT 0 CHECK (goals >= 0),
    assists INTEGER NOT NULL DEFAULT 0 CHECK (assists >= 0),
    yellow_cards INTEGER NOT NULL DEFAULT 0 CHECK (yellow_cards >= 0 AND yellow_cards <= 2),
    red_cards INTEGER NOT NULL DEFAULT 0 CHECK (red_cards >= 0 AND red_cards <= 1),
    is_mvp BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(event_id, player_id)
);

-- Habilitar RLS em stats
ALTER TABLE public.stats ENABLE ROW LEVEL SECURITY;

-- 7. Tabela de Comunicados (Announcements)
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar RLS em announcements
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- 8. Tabela de Quotas (Mensalidades dos Jogadores)
CREATE TABLE IF NOT EXISTS public.dues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    month_year TEXT NOT NULL, -- formato YYYY-MM
    amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status due_status NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(player_id, month_year)
);

-- Habilitar RLS em dues
ALTER TABLE public.dues ENABLE ROW LEVEL SECURITY;

-- 9. Tabela de Transações Financeiras (Caixa do Clube)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type transaction_type NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    description TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar RLS em transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;


--------------------------------------------------------------------------------
-- POLÍTICAS DE SEGURANÇA (Row Level Security - RLS)
--------------------------------------------------------------------------------

-- Função auxiliar para verificar o cargo do utilizador ativo
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 1. Políticas para PROFILES
CREATE POLICY "Profiles são legíveis por membros da equipa" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Utilizador pode editar o seu próprio perfil" 
ON public.profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())); -- impede mudança própria de role

CREATE POLICY "Administradores têm controlo total de perfis" 
ON public.profiles FOR ALL 
TO authenticated 
USING (public.get_user_role() = 'admin');

-- 2. Políticas para EVENTS
CREATE POLICY "Eventos legíveis por todos os membros" 
ON public.events FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Apenas treinadores e admins gerem eventos" 
ON public.events FOR ALL 
TO authenticated 
USING (public.get_user_role() IN ('coach', 'admin'));

-- 3. Políticas para CALLUPS (Convocatórias)
CREATE POLICY "Convocatórias legíveis por todos" 
ON public.callups FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Treinadores e admins inserem convocatórias" 
ON public.callups FOR INSERT 
TO authenticated 
WITH CHECK (public.get_user_role() IN ('coach', 'admin'));

CREATE POLICY "Treinadores e admins atualizam convocatórias" 
ON public.callups FOR UPDATE 
TO authenticated 
USING (public.get_user_role() IN ('coach', 'admin'));

CREATE POLICY "Treinadores e admins eliminam convocatórias" 
ON public.callups FOR DELETE 
TO authenticated 
USING (public.get_user_role() IN ('coach', 'admin'));

CREATE POLICY "Jogadores confirmam ou recusam a sua convocatória" 
ON public.callups FOR UPDATE 
TO authenticated 
USING (auth.uid() = player_id)
WITH CHECK (auth.uid() = player_id AND status IN ('confirmed', 'declined'));

-- 4. Políticas para ATTENDANCES (Presenças)
CREATE POLICY "Presenças legíveis por todos" 
ON public.attendances FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Treinadores e admins gerem presenças" 
ON public.attendances FOR ALL 
TO authenticated 
USING (public.get_user_role() IN ('coach', 'admin'));

-- Políticas para TOURNAMENT_SUSPENSIONS
CREATE POLICY "Suspensões legíveis por todos" 
ON public.tournament_suspensions FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Treinadores e admins gerem suspensões" 
ON public.tournament_suspensions FOR ALL 
TO authenticated 
USING (public.get_user_role() IN ('coach', 'admin'));

-- 5. Políticas para STATS
CREATE POLICY "Estatísticas legíveis por todos" 
ON public.stats FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Treinadores e admins gerem estatísticas" 
ON public.stats FOR ALL 
TO authenticated 
USING (public.get_user_role() IN ('coach', 'admin'));

-- 6. Políticas para ANNOUNCEMENTS
CREATE POLICY "Comunicados legíveis por todos" 
ON public.announcements FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Treinadores e admins gerem comunicados" 
ON public.announcements FOR ALL 
TO authenticated 
USING (public.get_user_role() IN ('coach', 'admin'));

-- 7. Políticas para DUES (Quotas)
CREATE POLICY "Utilizador vê as suas próprias quotas" 
ON public.dues FOR SELECT 
TO authenticated 
USING (auth.uid() = player_id);

CREATE POLICY "Admins gerem todas as quotas" 
ON public.dues FOR ALL 
TO authenticated 
USING (public.get_user_role() = 'admin');

-- 8. Políticas para TRANSACTIONS
CREATE POLICY "Apenas admins acedem e gerem transações" 
ON public.transactions FOR ALL 
TO authenticated 
USING (public.get_user_role() = 'admin');

-- 9. Políticas para CAMPOS, ADVERSÁRIOS E TORNEIOS
CREATE POLICY "Campos legíveis por todos" ON public.fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "Apenas treinadores e admins gerem campos" ON public.fields FOR ALL TO authenticated USING (public.get_user_role() IN ('coach', 'admin'));

CREATE POLICY "Adversários legíveis por todos" ON public.opponents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Apenas treinadores e admins gerem adversários" ON public.opponents FOR ALL TO authenticated USING (public.get_user_role() IN ('coach', 'admin'));

CREATE POLICY "Torneios legíveis por todos" ON public.tournaments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Apenas treinadores e admins gerem torneios" ON public.tournaments FOR ALL TO authenticated USING (public.get_user_role() IN ('coach', 'admin'));

CREATE POLICY "Plantel de torneios legível por todos" ON public.tournament_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "Apenas treinadores e admins gerem plantel de torneios" ON public.tournament_players FOR ALL TO authenticated USING (public.get_user_role() IN ('coach', 'admin'));


--------------------------------------------------------------------------------
-- TRIGGER: Criação automática de perfil no signup do Supabase Auth
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, status)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'Novo Jogador'),
    new.email,
    'player', -- Por omissão, todos entram como Jogadores. Admin pode alterar.
    'active'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

--------------------------------------------------------------------------------
-- TABELA DE CONFIGURAÇÕES DO CLUBE (Club Settings)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Single row table
    name TEXT NOT NULL DEFAULT 'Nome do Clube',
    initials TEXT NOT NULL DEFAULT 'SIGLA',
    logo_url TEXT,
    primary_color TEXT DEFAULT '#1c1c1c',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar RLS em club_settings
ALTER TABLE public.club_settings ENABLE ROW LEVEL SECURITY;

-- Políticas para CLUB_SETTINGS
CREATE POLICY "Configurações do clube são legíveis por todos" 
ON public.club_settings FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Apenas admins atualizam as configurações do clube" 
ON public.club_settings FOR UPDATE 
TO authenticated 
USING (public.get_user_role() = 'admin');

CREATE POLICY "Apenas admins inserem as configurações do clube" 
ON public.club_settings FOR INSERT 
TO authenticated 
WITH CHECK (public.get_user_role() = 'admin');

-- Inserir o registo inicial, caso não exista
INSERT INTO public.club_settings (id, name, initials) 
VALUES (1, 'Cascais Sport Clube', 'CSC') 
ON CONFLICT (id) DO NOTHING;
