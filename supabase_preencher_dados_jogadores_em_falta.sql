-- ============================================================================
-- ATUALIZAÇÃO SEGURA: PREENCHER DADOS EM FALTA DOS JOGADORES
-- ============================================================================
-- Regra estrita: apenas preenche campos que estejam actualmente NULL ou vazios.
-- Não substitui nem altera dados já existentes (usa COALESCE).
-- ============================================================================

DO $$
BEGIN
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1981-04-08'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), 'Cartão Residência 07J84Q325'),
        id_card_expiry = COALESCE(id_card_expiry, '2028-11-09'::date)
   WHERE name ILIKE '%Albano Rodrigues do Prado%';
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1981-09-21'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '11960727'),
        id_card_expiry = COALESCE(id_card_expiry, '2030-09-15'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '228649129')
   WHERE (email = 'andre.coutofz@gmail.com' OR name ILIKE '%André Gomes Marques do Couto%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1981-12-24'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '14256246'),
        id_card_expiry = COALESCE(id_card_expiry, '2031-08-03'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '226066541')
   WHERE (email = 'brsassuncao@gmail.com' OR name ILIKE '%Bruno Raul dos Santos Assunção%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1969-06-25'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '08959145'),
        id_card_expiry = COALESCE(id_card_expiry, '2027-10-31'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '182806898')
   WHERE (email = 'carlosnogueira.silva@gmail.com' OR name ILIKE '%Carlos Manuel Nogueira da Silva%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1987-12-06'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '12905326'),
        id_card_expiry = COALESCE(id_card_expiry, '2031-03-16'::date)
   WHERE name ILIKE '%Carlos Pedro Rocha Santos%';
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1981-12-24'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), 'Cartão Residência K8K416751'),
        id_card_expiry = COALESCE(id_card_expiry, '2030-08-12'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '238390659')
   WHERE (email = 'christianzor1981@gmail.com' OR name ILIKE '%Christian Zorzytzky%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1990-12-16'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '31616174'),
        id_card_expiry = COALESCE(id_card_expiry, '2030-10-27'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '244152977')
   WHERE (email = 'coioso218@gmail.com' OR name ILIKE '%Coio Só%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1988-02-27'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '13461948'),
        id_card_expiry = COALESCE(id_card_expiry, '2029-10-31'::date)
   WHERE name ILIKE '%Diogo Manuel Dinis Rios Silva%';
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1990-04-23'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), 'Cartão Residência 01246F1F4'),
        id_card_expiry = COALESCE(id_card_expiry, '2027-03-01'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '314064885')
   WHERE (email = 'guillermomendiguri@outlook.com' OR name ILIKE '%Luis Guillermo Mendiguri Barros%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1985-12-31'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), 'Cartão Residência 97P2713P4'),
        id_card_expiry = COALESCE(id_card_expiry, '2031-10-30'::date)
   WHERE name ILIKE '%Hui Deng%';
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1981-09-30'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '11959739'),
        id_card_expiry = COALESCE(id_card_expiry, '2031-05-04'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '207974033')
   WHERE (email = 'Jdanielcosta@gmail.com' OR name ILIKE '%Jorge Daniel Ferreira Costa%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1973-11-08'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '10331200'),
        id_card_expiry = COALESCE(id_card_expiry, '2031-08-03'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '182169138')
   WHERE (email = 'jbfbraga@gmail.com' OR name ILIKE '%João Bernardo Câmara Graça Figueiredo Braga%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1982-12-04'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '12138328'),
        id_card_expiry = COALESCE(id_card_expiry, '2030-06-26'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '232033862')
   WHERE (email = 'jocamatuto@gmail.com' OR name ILIKE '%João Carlos Morais Sarmento Silva Matuto%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1987-01-05'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '12719318'),
        id_card_expiry = COALESCE(id_card_expiry, '2031-01-07'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '244381330')
   WHERE name ILIKE '%João André Pantoja Amaral%';
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1988-07-29'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '31158663'),
        id_card_expiry = COALESCE(id_card_expiry, '2029-10-10'::date)
   WHERE name ILIKE '%Luíz Henrique Rodrigues Monteiro Gonçalves Santana%';
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1982-07-24'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '33271654'),
        id_card_expiry = COALESCE(id_card_expiry, '2031-08-02'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '242693784')
   WHERE (email = 'Luis65varela@gmail.com' OR name ILIKE '%Luís Miguel Tavares Varela%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1981-05-12'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '11678931'),
        id_card_expiry = COALESCE(id_card_expiry, '2030-08-10'::date)
   WHERE name ILIKE '%Marco César da Costa Neves%';
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1984-10-23'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '12648528'),
        id_card_expiry = COALESCE(id_card_expiry, '2030-05-20'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '234610522')
   WHERE (email = 'Mm@mecportugal.com' OR name ILIKE '%Mário Agostinho da Costa Martins%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1987-03-07'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '12968238'),
        id_card_expiry = COALESCE(id_card_expiry, '2032-08-03'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '225707667')
   WHERE (email = 'Nelson_severino7@hotmail.com' OR name ILIKE '%Nelson Ricardo Mariz Severino%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1981-11-21'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '11953999'),
        id_card_expiry = COALESCE(id_card_expiry, '2031-07-09'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '210037156')
   WHERE (email = 'Nuno.chaveiro@gmail.com' OR name ILIKE '%Nuno Luís Gonçalves Pereira Chaveiro%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1982-10-19'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '317467707'),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '250442086')
   WHERE (email = 'osclealves82@gmail.com' OR name ILIKE '%Osclesio Alves Rocha%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1978-12-23'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '11470141'),
        id_card_expiry = COALESCE(id_card_expiry, '2033-02-03'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '221130675')
   WHERE (email = 'Paulo.m.sampaio@gmail.com' OR name ILIKE '%Paulo Jorge Marques Sampaio%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1980-05-27'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '11658425'),
        id_card_expiry = COALESCE(id_card_expiry, '2029-01-18'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '208540350')
   WHERE (email = 'Santospauloricardo@sapo.pt' OR name ILIKE '%Paulo Ricardo Santos%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1976-04-07'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '10941897'),
        id_card_expiry = COALESCE(id_card_expiry, '2031-08-03'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '206603908')
   WHERE (email = 'Pedro.vieira@esporao.com' OR name ILIKE '%Pedro Almeida Lopes Vieira%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1984-09-23'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '12551298'),
        id_card_expiry = COALESCE(id_card_expiry, '2029-08-27'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '216218268')
   WHERE (email = 'Rmesquitaduarte@gmail.com' OR name ILIKE '%Ricardo Fernando Mesquita Duarte%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1981-02-28'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '11869119'),
        id_card_expiry = COALESCE(id_card_expiry, '2029-05-03'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '219488347')
   WHERE (email = 'rpmariano@gmail.com' OR name ILIKE '%Rui Pedro Rito Mariano%');
  UPDATE public.profiles
     SET birth_date = COALESCE(birth_date, '1986-07-17'::date),
        id_number = COALESCE(NULLIF(TRIM(id_number), ''), '13042677'),
        id_card_expiry = COALESCE(id_card_expiry, '2031-08-03'::date),
        nif = COALESCE(NULLIF(TRIM(nif), ''), '242773001')
   WHERE (email = 'tdrummond.borges@gmail.com' OR name ILIKE '%Tiago Mendonça e Moura Drummond Borges%');

  RAISE NOTICE 'Atualização segura de campos vazios concluída.';
END $$;
