-- Migração da Tabela de Perfis e Importação de Jogadores do PDF

-- 1. Garantir remoção da restrição de chave estrangeira com auth.users (permite atletas sem conta de login criada), UUID default e colunas novas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shirt_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kit_size TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nif TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id_card_expiry DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gdpr_consent BOOLEAN DEFAULT TRUE;

-- 2. Inserção / Atualização (Upsert) de todos os atletas extraídos do PDF
INSERT INTO public.profiles (
  name,
  nickname,
  shirt_name,
  email,
  phone,
  birth_date,
  nationality,
  address,
  postal_code,
  city,
  nif,
  id_number,
  id_card_expiry,
  iban,
  jersey_number,
  kit_size,
  gdpr_consent,
  role,
  status,
  position
) VALUES
-- 1
('André Gomes Marques do Couto', 'A. Couto', 'A. COUTO', 'andre.coutofz@gmail.com', '965024912', '1981-09-21', 'Portuguesa', 'Rua Serra da Arrábida, LT 1263, 3 Esq.', '2975-164', 'Quinta do Conde - Sesimbra', '228649129', '11960727', '2030-09-15', 'PT50003506760001153960089', 99, 'L', TRUE, 'player', 'active', 'Avançado Centro'),
-- 2
('Bruno Raul dos Santos Assunção', 'Tochê', 'Tochê', 'brsassuncao@gmail.com', '960491434', '1981-12-24', 'Português', 'Rua José Branco Rodrigues n.57', '2775-107', 'Parede', '226066541', '14256246', '2031-08-03', 'PT50 0007 0366 0002 8370 0096 9', 24, 'L', TRUE, 'player', 'active', 'Médio Centro'),
-- 3
('Carlos Manuel Nogueira da Silva', 'Carlos Nogueira', 'Carlos Nogueira', 'carlosnogueira.silva@gmail.com', '938703202', '1969-06-25', 'Português', 'Rua 25 de Abril, nº 92, Aldeia de Juso', '2750-049', 'Cascais', '182806898', '08959145', '2027-10-31', 'PT50.0033.0000.0004.9104.4080.5', 6, 'L', TRUE, 'player', 'active', 'Defesa Central Esquerdo'),
-- 4
('Carlos Pedro Rocha Santos', 'Carlos Santos', 'Carlos Santos', 'cprsantos22@hotmail.com', '912223763', '1987-12-06', 'Portuguesa', 'Rua Capitão Rei Vilar 327A', '2755-546', 'Alcabideche', '242682804', '12905326', '2031-03-16', 'PT50003509950060789363050', 14, 'XL', TRUE, 'player', 'active', 'Médio Ofensivo'),
-- 5
('Christian Zorzytzky', 'Christian', 'Christian', 'christianzor1981@gmail.com', '965443906', '1981-12-24', 'Alemã', 'Rua de Braga 52 R/C Drt', '2755-275', 'Alcabideche', '238390659', 'Cartão Residência K8K416751', '2030-08-12', 'PT50.0010.0000.2623.6280.0018.3', 81, 'L', TRUE, 'player', 'active', 'Médio Centro'),
-- 6
('Coio So', 'Coio', 'Coio', 'coioso218@gmail.com', '913273718', '1990-12-16', 'Portuguesa', 'Rua da Alemanha, casa 29', '2645-273', 'Alcabideche', '244152977', '31616174', '2030-10-27', 'PT5000 350 2160007286660069', 90, 'M', TRUE, 'player', 'active', 'Avançado Centro'),
-- 7
('Deng Hui', 'Deng', 'Deng', 'denghui@csc.pt', '962247509', '1985-12-31', 'Chinesa', 'Alcabideche, Cascais', '2750-000', 'Cascais', '290632161', 'Passaporte EJ5015883', '2031-10-20', NULL, 85, 'L', TRUE, 'player', 'active', 'Médio Centro'),
-- 8
('Iracelmo José Machado Coelho', 'Ira', 'Ira', 'ira_th@hotmail.com', '928211051', '1984-07-19', 'Angolana', 'Rua João António Gaspar vivenda Delfim', '2645-207', 'Alcabideche', '241921317', '33517934', '2025-09-15', 'PT50.0079.0000.7674.1919.1015.5', 68, 'L', TRUE, 'player', 'active', 'Extremo Direito'),
-- 9
('Fábio Cláudio Monteiro de Sá Weber', 'Weber', 'Weber', 'fabio1994weber@gmail.com', '919461518', '1994-05-26', 'Portuguesa', 'Rua Cidade de Lagos 22 4C, Algueirão', '2725-671', 'Mem Martins', '237889660', '14675595 2 ZX8', '2029-09-03', 'PT50 0023 0000 4562 5460 1949 4', 15, 'L', TRUE, 'player', 'active', 'Lateral Esquerdo'),
-- 10
('Jefferson Osvaldo de Brito', 'Jeff', 'Jeff', 'Jeff_nr9@hotmail.com', '968808402', '1980-03-14', 'Portuguesa', 'Bairro da cruz vermelha lote 38 2esq praceta da Índia', '2645-288', 'Alcabideche', '222581700', '30344512', '2030-01-20', 'PT50.0035.0217.0000.6287.9005.9', 11, 'M', TRUE, 'player', 'active', 'Avançado Centro'),
-- 11
('João Bernardo Câmara Graça Figueiredo Braga', 'Braga', 'BRAGA', 'jbfbraga@gmail.com', '964844228', '1973-11-08', 'Português', 'R. Engenheiro Adelino Amaro da Costa 429 Bloco B, R.Ch Dto2', '2775-149', 'Parede', '182169138', '10331200', '2025-09-23', 'PT50.0007.0207.0033.0500.0075.4', 72, 'M', TRUE, 'player', 'active', 'Guarda-redes'),
-- 12
('João Carlos Morais Sarmento Silva Matuto', 'Matuto', 'Matuto', 'jocamatuto@gmail.com', '915104885', '1982-12-04', 'Portuguesa', 'Rua Eça de Queirós 109', '2750-030', 'Aldeia de Juzo - Cascais', '232033862', '12138328', '2030-06-26', 'PT50.0035.0017.0000.0696.8001.5', 22, 'M', TRUE, 'player', 'active', 'Médio Centro'),
-- 13
('Jorge Daniel Ferreira Costa', 'Jorge Costa', 'Jorge Costa', 'Jdanielcosta@gmail.com', '912657526', '1981-09-30', 'Portuguesa', 'Rua de Santana 1640 casa 12', '2750-833', 'Cobre - Cascais', '207974033', '11959739', '2031-05-04', 'PT50.0269.0120.0020.2052.7219.1', 23, 'XL', TRUE, 'player', 'active', 'Defesa Central Direito'),
-- 14
('Luis Guillermo Mendiguri Barros', 'Guillherme', 'Guillherme', 'guillermomendiguri@outlook.com', '936867310', '1990-04-23', 'Peruana', 'Rua cidade de Faro n21 2C', '2725-003', 'Sintra', '314064885', '01246F1F4', '2027-03-01', 'PT50.0018.0003.5673.1383.0202.0', 9, 'M', TRUE, 'player', 'active', 'Avançado Centro'),
-- 15
('Luís Miguel Tavares Varela', 'Varela', 'Varela', 'Luis65varela@gmail.com', '935654131', '1982-07-24', 'Português', 'Praceta alcino frazão lote 50 R/C', '2645-142', 'Alcabideche', '242693784', '33271654', '2031-08-02', 'PT50001000005944083000148', 10, 'XL', TRUE, 'player', 'active', 'Médio Ofensivo'),
-- 16
('Mário Agostinho da Costa Martins', 'M&M', 'M&M', 'Mm@mecportugal.com', '914650873', '1984-10-23', 'Português', 'Praceta Santo António n12 1°', '2775-791', 'Carcavelos', '234610522', '12648528', '2030-05-20', 'PT50000000000000', 23, 'L', TRUE, 'player', 'active', 'Médio Defensivo'),
-- 17
('Nelson Ricardo Mariz Severino', 'Save', 'Save', 'Nelson_severino7@hotmail.com', '919480420', '1987-03-07', 'Portuguesa', 'Rua das alfarrobeiras n120 cave', '2645-310', 'Alcabideche', '225707667', '12968238', '2032-08-03', 'PT50.0033.0000.4532.2158.7510.5', 7, 'XL', TRUE, 'player', 'active', 'Médio Direito'),
-- 18
('Mauro Rocha Rodrigues', 'Mauro R', 'Mauro R', 'maurodrigues11@hotmail.com', '917137974', '1993-12-06', 'Angolana', 'Avenida Doutor Morais Sarmento nº25, 2ºdireito', '2755-285', 'Alcabideche', '238435997', '703K4K17', '2026-01-06', '0023 0000 4545 8180 8819 4', 77, 'M', TRUE, 'player', 'active', 'Extremo Esquerdo'),
-- 19
('Nuno Luís Gonçalves Pereira Chaveiro', 'Chaveiro', 'Chaveiro', 'Nuno.chaveiro@gmail.com', '914821135', '1981-11-21', 'Portuguesa', 'Rua dos Moinhos 109', '2645-480', 'Alcabideche', '210037156', '11953999 3zx2', '2031-07-09', 'PT50.0035.0549.0004.0686.9006.5', 13, 'XL', TRUE, 'player', 'active', 'Defesa Central Esquerdo'),
-- 20
('Osclesio Alves Rocha', 'Kiko', 'Kiko', 'osclealves82@gmail.com', '924345480', '1982-10-19', 'Brasileiro', 'Rua da torre número 1027 Cascais', '2750-768', 'Cascais', '250442086', '317467707', '2029-02-09', 'PT50.0033.0000.4549.7888.2190.5', 90, 'M', TRUE, 'player', 'active', 'Avançado Centro'),
-- 21
('Paulo Jorge Marques Sampaio', 'Sampaio', 'Sampaio', 'Paulo.m.sampaio@gmail.com', '932136177', '1978-12-23', 'Portuguesa', 'Rua do Viveiro lote 15 3C', '2765-295', 'Monte Estoril', '221130675', '11470141', '2033-02-03', 'PT50.0033.0000.4529.2126.5810.5', 21, 'XL', TRUE, 'player', 'active', 'Defesa Central Direito'),
-- 22
('Paulo Ricardo Santos', 'PP', 'PP', 'Santospauloricardo@sapo.pt', '913754725', '1980-05-27', 'Portuguesa', 'Praceta Fernando Curado Ribeiro n° 102 R/C ESQUERDO', '2645-620', 'Alcabideche', '208540350', '11658425 4ZY7', '2029-01-18', 'PT50.0010.0000.6020.7880.0016.0', 4, 'XL', TRUE, 'player', 'active', 'Lateral Direito'),
-- 23
('Paulo Sérgio Guerreiro Alves', 'Paulo Alves', 'Paulo Alves', 'pauloalvespintassa@sapo.pt', '967658459', '1973-08-08', 'Portuguesa', 'Rua Arquitecto Quirino da Fonseca, 43', '2645-290', 'Alcabideche', '197782906', '10369549 4ZV9', '2031-06-21', 'PT50.0036.0209.9910.0062.4107.5', 26, 'M', TRUE, 'player', 'active', 'Médio Centro'),
-- 24
('Pedro A. Gouveia Bandeira de Lima', 'Pedro Lima', 'Pedro Lima', 'pedroblima7@gmail.com', '913250888', '1977-05-08', 'Portuguêsa', 'Rua João Infante n130 Lote 9 2-A', '2750-384', 'Cascais', '226422747', '1108733', '2025-05-31', 'PT50 0018 0003 1789 6341 0203 9', 5, 'L', TRUE, 'player', 'active', 'Defesa Central Esquerdo'),
-- 25
('Pedro Almeida Lopes Vieira', 'Vieira', 'Vieira', 'Pedro.vieira@esporao.com', '912663347', '1976-04-07', 'Portuguesa', 'Praceta Portela Areia N119', '2750-061', 'Cascais', '206603908', '10941897', '2031-08-03', 'PT50.0018.0003.5103.3538.0205.0', 2, 'XL', TRUE, 'player', 'active', 'Lateral Esquerdo'),
-- 26
('Ricardo Fernando Mesquita Duarte', 'Duarte', 'Duarte', 'Rmesquitaduarte@gmail.com', '913592646', '1984-09-23', 'Portuguesa', 'Rua dos Lilazes n 751', '2850-245', 'Birre Cascais', '216218268', '12551298', '2029-08-27', 'PT50.0033.0000.4533.1073.8270.5', 12, 'XL', TRUE, 'player', 'active', 'Guarda-redes'),
-- 27
('Ruben da Cruz', 'Cruz', 'Cruz', 'Portoforeverdark@gmail.com', '939547852', '1992-04-07', 'Cabo Verde', 'Rua casal do Geraldo vivenda Cardoso e filhos', '2645–179', 'Alcabideche', '268525463', 'Pa246632', '2027-02-13', 'PT50.0010.0000.6211.9370.0011.9', 7, 'M', TRUE, 'player', 'active', 'Extremo Direito'),
-- 28
('Rui Pedro Rito Mariano', 'Mariano', 'Mariano', 'rpmariano@gmail.com', '913663956', '1981-02-28', 'Portuguesa', 'Travessa Mário Henrique Leiria N1, R/C dto', '2750-570', 'Cascais', '219488347', '11869119', '2029-05-03', 'já tenho debito direto', 17, 'L', TRUE, 'admin', 'active', 'Defesa Central Direito, Lateral Direito'),
-- 29
('Sérgio Paulo Namora Henriques', 'Namora', 'Namora', 'spnhenriques@gmail.com', '916476294', '1981-08-24', 'Portuguesa', 'Av.Dct.Manuel Ricardo Espirito Santo e Silva N175 2º Drt.', '2750-748', 'Cascais', '228165016', '12205891', '2030-08-30', 'PT50026901520020302097684', 25, 'XL', TRUE, 'player', 'active', 'Defesa Central Esquerdo'),
-- 30
('Tiago Dias Ricardo Morais', 'Tiago Morais', 'Tiago Morais', 'Agenda.tiagomorais@gmail.com', '928127758', '1981-01-27', 'Português', 'Rua Principal de Bicesse 114', '2645-361', 'Alcabideche', '223911976', '11937027', '2031-06-21', 'PT50.0193.0000.1050.0622.6258.9', 78, 'L', TRUE, 'player', 'active', 'Médio Centro'),
-- 31
('Tiago Mendonça e Moura Drummond Borges', 'Tiago', 'Tiago', 'tdrummond.borges@gmail.com', '918147491', '1986-07-17', 'Portuguesa', 'Av. Nossa Sª do Rosario, 1018 Cascais', '2750-178', 'Cascais', '242773001', '13042677', '2031-08-03', 'PT50.0010.0000.3530.7650.0017.8', 8, 'L', TRUE, 'player', 'active', 'Médio Esquerdo')
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  nickname = EXCLUDED.nickname,
  shirt_name = EXCLUDED.shirt_name,
  phone = EXCLUDED.phone,
  birth_date = EXCLUDED.birth_date,
  nationality = EXCLUDED.nationality,
  address = EXCLUDED.address,
  postal_code = EXCLUDED.postal_code,
  city = EXCLUDED.city,
  nif = EXCLUDED.nif,
  id_number = EXCLUDED.id_number,
  id_card_expiry = EXCLUDED.id_card_expiry,
  iban = EXCLUDED.iban,
  jersey_number = EXCLUDED.jersey_number,
  kit_size = EXCLUDED.kit_size,
  gdpr_consent = EXCLUDED.gdpr_consent;
