import test from 'node:test'
import assert from 'node:assert/strict'
import { JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B } from '../src/lib/sidelineCalendarioDef.ts'

test('Sideline Grupo B: Validação integral do calendário oficial das 7 jornadas', () => {
  // 1. Total de jogos deve ser rigorosamente 21 (3 jogos x 7 jornadas)
  assert.equal(JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B.length, 21, 'Devem existir exatamente 21 jogos no Grupo B')

  // 2. Cada jornada (1 a 7) deve ter exatamente 3 jogos
  for (let j = 1; j <= 7; j++) {
    const jogosJornada = JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B.filter(m => m.matchday === j)
    assert.equal(jogosJornada.length, 3, `Jornada ${j} deve ter exatamente 3 jogos`)
  }

  // 3. As 7 equipas oficiais
  const equipasEsperadas = [
    'Cascais',
    'Ferroviário',
    'Técnico',
    'Bola Cacém',
    'Amora',
    'Estrelas Lisboa',
    'Torre',
  ]

  // 4. Cada equipa joga 6 jogos (1 folga/isento em 7 jornadas)
  for (const eq of equipasEsperadas) {
    const jogosEquipa = JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B.filter(
      m => m.home_team_name === eq || m.away_team_name === eq
    )
    assert.equal(jogosEquipa.length, 6, `A equipa ${eq} deve jogar 6 jogos no grupo de 7 equipas`)

    // Determinar a jornada em que está isenta
    const jornadasJogadas = new Set(jogosEquipa.map(m => m.matchday))
    assert.equal(jornadasJogadas.size, 6, `A equipa ${eq} deve jogar em 6 jornadas distintas`)
    const jornadaIsenta = [1, 2, 3, 4, 5, 6, 7].find(j => !jornadasJogadas.has(j))
    assert.ok(jornadaIsenta, `A equipa ${eq} deve ter uma jornada de isenção`)
  }

  // 5. Verificar as isenções oficiais de acordo com o calendário da Sideline
  // J1: Torre isento
  // J2: Ferroviário isento
  // J3: Cascais isento
  // J4: Bola Cacém isento
  // J5: Amora isento
  // J6: Estrelas Lisboa isento
  // J7: Técnico isento
  const isentosPorJornada = {
    1: 'Torre',
    2: 'Ferroviário',
    3: 'Cascais',
    4: 'Bola Cacém',
    5: 'Amora',
    6: 'Estrelas Lisboa',
    7: 'Técnico',
  }

  for (const [jStr, eqIsenta] of Object.entries(isentosPorJornada)) {
    const j = Number(jStr)
    const jgs = JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B.filter(m => m.matchday === j)
    const equipasNaJornada = jgs.flatMap(m => [m.home_team_name, m.away_team_name])
    assert.ok(!equipasNaJornada.includes(eqIsenta), `Na Jornada ${j}, ${eqIsenta} deve estar ISENTO`)
    assert.equal(equipasNaJornada.length, 6, `Na Jornada ${j}, devem jogar 6 equipas`)
  }

  // 6. Verificar que não há confrontos repetidos (cada par joga exatamente 1 vez na 1ª fase)
  const confrontos = new Set()
  for (const m of JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B) {
    const par = [m.home_team_name, m.away_team_name].sort().join(' vs ')
    assert.ok(!confrontos.has(par), `Confronto duplicado encontrado: ${par}`)
    confrontos.add(par)
  }
  assert.equal(confrontos.size, 21, 'Devem existir 21 confrontos únicos')

  // 7. Validação pontual de jogos específicos do documento oficial
  // Jogo 1: C. Ferroviário P. vs Técnico F.C. (11/10/26 18:30)
  const j1 = JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B.find(m => m.match_number === 1)
  assert.equal(j1?.home_team_name, 'Ferroviário')
  assert.equal(j1?.away_team_name, 'Técnico')
  assert.equal(j1?.match_date, '2026-10-11')
  assert.equal(j1?.match_time, '18:30')
  assert.equal(j1?.location, 'Marvila')

  // Jogo 8: G.D.S. Cascais vs A.F.D. Torre (17/10/26 20:00)
  const j8 = JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B.find(m => m.match_number === 8)
  assert.equal(j8?.home_team_name, 'Cascais')
  assert.equal(j8?.away_team_name, 'Torre')
  assert.equal(j8?.match_date, '2026-10-17')
  assert.equal(j8?.match_time, '20:00')

  // Jogo 27: G.D.S. Cascais vs A. Bola Cacém (12/12/26 20:00)
  const j27 = JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B.find(m => m.match_number === 27)
  assert.equal(j27?.home_team_name, 'Cascais')
  assert.equal(j27?.away_team_name, 'Bola Cacém')
  assert.equal(j27?.match_date, '2026-12-12')
  assert.equal(j27?.match_time, '20:00')
})
