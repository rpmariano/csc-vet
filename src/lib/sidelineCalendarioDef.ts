export interface JogoCalendarioSidelineDef {
  match_number: number
  matchday: number
  home_team_name: string
  away_team_name: string
  match_date: string
  match_time: string
  location: string
  iso_datetime: string
}

/**
 * Calendário oficial da Liga Masters 35 - 2026/27 - Grupo B - Sideline Events.
 * Extraído diretamente do documento oficial fornecido pelo organizador.
 *
 * Contém os 21 jogos distribuídos pelas 7 Jornadas da 1ª Fase (Grupo B).
 * As equipas isentas de cada jornada não geram jogo.
 */
export const JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B: JogoCalendarioSidelineDef[] = [
  // 1ª Jornada (Isento: A.F.D. Torre)
  {
    match_number: 1,
    matchday: 1,
    home_team_name: 'Ferroviário',
    away_team_name: 'Técnico',
    match_date: '2026-10-11',
    match_time: '18:30',
    location: 'Marvila',
    iso_datetime: '2026-10-11T18:30:00+01:00',
  },
  {
    match_number: 2,
    matchday: 1,
    home_team_name: 'Bola Cacém',
    away_team_name: 'Amora',
    match_date: '2026-10-25',
    match_time: '19:00',
    location: 'Agualva',
    iso_datetime: '2026-10-25T19:00:00+01:00',
  },
  {
    match_number: 3,
    matchday: 1,
    home_team_name: 'Estrelas Lisboa',
    away_team_name: 'Cascais',
    match_date: '2026-10-11',
    match_time: '19:30',
    location: 'S.L. Olivais',
    iso_datetime: '2026-10-11T19:30:00+01:00',
  },

  // 2ª Jornada (Isento: C. Ferroviário P.)
  {
    match_number: 5,
    matchday: 2,
    home_team_name: 'Técnico',
    away_team_name: 'Bola Cacém',
    match_date: '2026-10-16',
    match_time: '22:15',
    location: 'Frielas',
    iso_datetime: '2026-10-16T22:15:00+01:00',
  },
  {
    match_number: 7,
    matchday: 2,
    home_team_name: 'Amora',
    away_team_name: 'Estrelas Lisboa',
    match_date: '2026-10-17',
    match_time: '18:00',
    location: 'Amora',
    iso_datetime: '2026-10-17T18:00:00+01:00',
  },
  {
    match_number: 8,
    matchday: 2,
    home_team_name: 'Cascais',
    away_team_name: 'Torre',
    match_date: '2026-10-17',
    match_time: '20:00',
    location: 'Cascais',
    iso_datetime: '2026-10-17T20:00:00+01:00',
  },

  // 3ª Jornada (Isento: G.D.S. Cascais)
  {
    match_number: 9,
    matchday: 3,
    home_team_name: 'Estrelas Lisboa',
    away_team_name: 'Técnico',
    match_date: '2026-11-01',
    match_time: '19:00',
    location: 'S.L. Olivais',
    iso_datetime: '2026-11-01T19:00:00+00:00',
  },
  {
    match_number: 10,
    matchday: 3,
    home_team_name: 'Bola Cacém',
    away_team_name: 'Ferroviário',
    match_date: '2026-11-01',
    match_time: '19:00',
    location: 'Agualva',
    iso_datetime: '2026-11-01T19:00:00+00:00',
  },
  {
    match_number: 11,
    matchday: 3,
    home_team_name: 'Torre',
    away_team_name: 'Amora',
    match_date: '2026-11-01',
    match_time: '18:30',
    location: 'Torre',
    iso_datetime: '2026-11-01T18:30:00+00:00',
  },

  // 4ª Jornada (Isento: A. Bola Cacém)
  {
    match_number: 13,
    matchday: 4,
    home_team_name: 'Técnico',
    away_team_name: 'Torre',
    match_date: '2026-11-06',
    match_time: '22:15',
    location: 'Frielas',
    iso_datetime: '2026-11-06T22:15:00+00:00',
  },
  {
    match_number: 14,
    matchday: 4,
    home_team_name: 'Ferroviário',
    away_team_name: 'Estrelas Lisboa',
    match_date: '2026-11-08',
    match_time: '18:30',
    location: 'Marvila',
    iso_datetime: '2026-11-08T18:30:00+00:00',
  },
  {
    match_number: 16,
    matchday: 4,
    home_team_name: 'Amora',
    away_team_name: 'Cascais',
    match_date: '2026-11-07',
    match_time: '18:00',
    location: 'Amora',
    iso_datetime: '2026-11-07T18:00:00+00:00',
  },

  // 5ª Jornada (Isento: Amora F.C.)
  {
    match_number: 17,
    matchday: 5,
    home_team_name: 'Cascais',
    away_team_name: 'Técnico',
    match_date: '2026-11-21',
    match_time: '20:00',
    location: 'Cascais',
    iso_datetime: '2026-11-21T20:00:00+00:00',
  },
  {
    match_number: 18,
    matchday: 5,
    home_team_name: 'Torre',
    away_team_name: 'Ferroviário',
    match_date: '2026-11-22',
    match_time: '18:30',
    location: 'Torre',
    iso_datetime: '2026-11-22T18:30:00+00:00',
  },
  {
    match_number: 19,
    matchday: 5,
    home_team_name: 'Estrelas Lisboa',
    away_team_name: 'Bola Cacém',
    match_date: '2026-11-22',
    match_time: '19:00',
    location: 'S.L. Olivais',
    iso_datetime: '2026-11-22T19:00:00+00:00',
  },

  // 6ª Jornada (Isento: F.C. Estrelas Lisboa)
  {
    match_number: 21,
    matchday: 6,
    home_team_name: 'Técnico',
    away_team_name: 'Amora',
    match_date: '2026-11-27',
    match_time: '22:15',
    location: 'Frielas',
    iso_datetime: '2026-11-27T22:15:00+00:00',
  },
  {
    match_number: 22,
    matchday: 6,
    home_team_name: 'Ferroviário',
    away_team_name: 'Cascais',
    match_date: '2026-11-29',
    match_time: '18:30',
    location: 'Marvila',
    iso_datetime: '2026-11-29T18:30:00+00:00',
  },
  {
    match_number: 23,
    matchday: 6,
    home_team_name: 'Bola Cacém',
    away_team_name: 'Torre',
    match_date: '2026-11-29',
    match_time: '19:00',
    location: 'Agualva',
    iso_datetime: '2026-11-29T19:00:00+00:00',
  },

  // 7ª Jornada (Isento: Técnico F.C.)
  {
    match_number: 26,
    matchday: 7,
    home_team_name: 'Amora',
    away_team_name: 'Ferroviário',
    match_date: '2026-12-12',
    match_time: '18:00',
    location: 'Amora',
    iso_datetime: '2026-12-12T18:00:00+00:00',
  },
  {
    match_number: 27,
    matchday: 7,
    home_team_name: 'Cascais',
    away_team_name: 'Bola Cacém',
    match_date: '2026-12-12',
    match_time: '20:00',
    location: 'Cascais',
    iso_datetime: '2026-12-12T20:00:00+00:00',
  },
  {
    match_number: 28,
    matchday: 7,
    home_team_name: 'Torre',
    away_team_name: 'Estrelas Lisboa',
    match_date: '2026-12-13',
    match_time: '18:30',
    location: 'Torre',
    iso_datetime: '2026-12-13T18:30:00+00:00',
  },
]
