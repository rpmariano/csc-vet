import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, FIXTURES_BASE, UTILIZADOR_TESTE, type Fixtures } from './supabase-mock'

/**
 * Quando é que a convocatória aceita respostas.
 *
 * A regra vive em `convocatoriaFechada()`, no CalendarPage, e estava escrita
 * por extenso em quatro sítios que já divergiam entre si. Em resumo:
 *
 * - **Tudo se responde, treinos incluídos**, assim que o evento deixa de ser
 *   rascunho e tem gente convocada.
 * - **O treino tem janela**: abre seis dias antes e fecha à hora a que começa,
 *   e não à de concentração. São semanais e convocam automaticamente todos os
 *   aptos: sem janela havia sempre um treino por responder na lista.
 * - E qualquer um fecha com a ficha de jogo lançada, ou passada a hora limite.
 */

const DAQUI_A_DIAS = (d: number) => new Date(Date.now() + d * 864e5).toISOString()

const base = {
  location: 'Campo de Teste', description: null, field_id: null, tournament_id: null,
  home_away: 'home', is_friendly: false, max_players: null, meeting_time: null,
  home_score: null, away_score: null, is_active: true,
}

const EU = FIXTURES_BASE.profiles[0] as Record<string, unknown>
const convocatoriaMinha = (eventId: string) => ({
  id: 'c-' + eventId, event_id: eventId, player_id: UTILIZADOR_TESTE.id,
  status: 'called', responded_at: null, player: EU,
})

/** O bloco de resposta, na persiana do evento. */
const perguntaDaConvocatoria = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog').getByText(/Contamos contigo\?|Disseste que (sim|não)/)

async function abre(page: import('@playwright/test').Page, fixtures: Fixtures, id: string) {
  await montarSupabaseFalso(page, fixtures)
  await page.goto(`/csc-vet/calendar?event=${id}`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('num treino perto, pergunta-se como em tudo o resto', async ({ page }) => {
  const treino = { ...base, id: 'tr', title: 'Treino', type: 'practice', date_time: DAQUI_A_DIAS(1) }
  await abre(page, { events: [treino], callups: [convocatoriaMinha('tr')] }, 'tr')

  await expect(perguntaDaConvocatoria(page)).toBeVisible()
})

test('um treino longe ainda não abriu — e diz isso, não que fechou', async ({ page }) => {
  const treino = { ...base, id: 'tr', title: 'Treino', type: 'practice', date_time: DAQUI_A_DIAS(9) }
  await abre(page, { events: [treino], callups: [convocatoriaMinha('tr')] }, 'tr')

  await expect(perguntaDaConvocatoria(page)).toHaveCount(0)
  await expect(page.getByRole('dialog').getByText(/A resposta abre 6 dias antes do treino/)).toBeVisible()
})

test('um treino fecha à hora a que começa, e não à de concentração', async ({ page }) => {
  // Começou há uma hora; a concentração seria antes disso.
  const treino = {
    ...base, id: 'tr', title: 'Treino', type: 'practice',
    date_time: new Date(Date.now() - 3600e3).toISOString(), meeting_time: '08:00',
  }
  await abre(page, { events: [treino], callups: [convocatoriaMinha('tr')] }, 'tr')

  await expect(perguntaDaConvocatoria(page)).toHaveCount(0)
  await expect(page.getByRole('dialog').getByText(/o treino já começou/)).toBeVisible()
})

test('num jogo publicado e com convocados, pergunta-se', async ({ page }) => {
  const jogo = { ...base, id: 'jg', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20) }
  await abre(page, { events: [jogo], callups: [convocatoriaMinha('jg')] }, 'jg')

  // Vinte dias antes: com a regra antiga só abriria a seis dias.
  await expect(perguntaDaConvocatoria(page)).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Sim' })).toBeVisible()
})

test('num convívio, o mesmo que num jogo', async ({ page }) => {
  const convivio = { ...base, id: 'cv', title: 'Jantar', type: 'gathering', date_time: DAQUI_A_DIAS(20) }
  await abre(page, { events: [convivio], callups: [convocatoriaMinha('cv')] }, 'cv')

  await expect(perguntaDaConvocatoria(page)).toBeVisible()
})

test('um rascunho não aceita resposta', async ({ page }) => {
  const rascunho = { ...base, id: 'rs', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20), is_active: false }
  await abre(page, { events: [rascunho], callups: [convocatoriaMinha('rs')] }, 'rs')

  await expect(perguntaDaConvocatoria(page)).toHaveCount(0)
  await expect(page.getByRole('dialog').getByText(/Em rascunho/)).toBeVisible()
})

test('sem ninguém convocado não há a quem perguntar', async ({ page }) => {
  const jogo = { ...base, id: 'vz', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20) }
  await abre(page, { events: [jogo], callups: [] }, 'vz')

  await expect(perguntaDaConvocatoria(page)).toHaveCount(0)
  await expect(page.getByRole('dialog').getByText(/Convocatória por fazer/)).toBeVisible()
})

/**
 * O alerta de eventos por convocar, na Home de quem gere (ecrã 4c).
 *
 * Tinha uma janela de sete dias e por isso calava-se precisamente no caso que
 * interessa: um jogo marcado com duas semanas de antecedência ficava sem
 * convocatória e sem aviso. O caso a vinte dias está aqui de propósito — com
 * a janela, este teste falha.
 */
test.describe('Alerta de eventos por convocar', () => {
  const faixa = (page: import('@playwright/test').Page) =>
    page.getByRole('button', { name: /evento[s]? sem convocatória/ })

  async function home(page: import('@playwright/test').Page, fixtures: Fixtures) {
    await montarSupabaseFalso(page, fixtures)
    await page.goto('/csc-vet/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(400)
  }

  test('avisa de um jogo a vinte dias sem ninguém convocado', async ({ page }) => {
    const jogo = { ...base, id: 'lg', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20) }
    await home(page, { events: [jogo], callups: [] })
    await expect(faixa(page)).toBeVisible()
  })

  test('cala-se quando já há convocados', async ({ page }) => {
    const jogo = { ...base, id: 'lg', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20) }
    await home(page, { events: [jogo], callups: [convocatoriaMinha('lg')] })
    await expect(faixa(page)).toHaveCount(0)
  })

  test('não avisa de rascunhos nem de treinos', async ({ page }) => {
    await home(page, {
      events: [
        { ...base, id: 'rs', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20), is_active: false },
        { ...base, id: 'tr', title: 'Treino', type: 'practice', date_time: DAQUI_A_DIAS(20) },
      ],
      callups: [],
    })
    await expect(faixa(page)).toHaveCount(0)
  })
})

/**
 * A assimetria entre os dois avisos, que é deliberada.
 *
 * A Agenda é onde se trabalha: um rascunho por convocar é trabalho por acabar
 * e fica à vista de quem o criou, marcado como rascunho. A Home é o aviso que
 * insiste, e não deve insistir com uma coisa que a equipa técnica pôs de lado
 * de propósito.
 */
test.describe('Rascunho por convocar', () => {
  const rascunho = {
    ...base, id: 'rs', title: 'Jogo', type: 'match',
    date_time: DAQUI_A_DIAS(20), is_active: false,
  }

  test('aparece na Agenda, marcado como rascunho', async ({ page }) => {
    await montarSupabaseFalso(page, { events: [rascunho], callups: [] })
    await page.goto('/csc-vet/calendar')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Ninguém foi convocado')).toBeVisible()
    await expect(page.getByText('Rascunho', { exact: true })).toBeVisible()
    await expect(page.getByText(/não avisa ninguém nem entra no alerta da Home/)).toBeVisible()
  })

  test('não aparece no alerta da Home', async ({ page }) => {
    await montarSupabaseFalso(page, { events: [rascunho], callups: [] })
    await page.goto('/csc-vet/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(400)

    await expect(page.getByRole('button', { name: /evento[s]? sem convocatória/ })).toHaveCount(0)
  })

  test('publicado, aparece nos dois', async ({ page }) => {
    const publicado = { ...rascunho, is_active: true }

    await montarSupabaseFalso(page, { events: [publicado], callups: [] })
    await page.goto('/csc-vet/calendar')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Ninguém foi convocado')).toBeVisible()
    await expect(page.getByText('Rascunho', { exact: true })).toHaveCount(0)

    await page.goto('/csc-vet/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(400)
    await expect(page.getByRole('button', { name: /evento[s]? sem convocatória/ })).toBeVisible()
  })
})

/**
 * Um rascunho não é um evento anunciado, e a Agenda tem de o dizer.
 *
 * Aparecia na Agenda de toda a gente como um evento normal — um jogador podia
 * contar com um jogo que a equipa técnica ainda não tinha marcado a sério.
 */
test.describe('Rascunho na lista da Agenda', () => {
  const rascunho = {
    ...base, id: 'rs', title: 'Jantar por confirmar', type: 'gathering',
    date_time: DAQUI_A_DIAS(10), is_active: false,
  }

  /** O mock cria um admin; para o caso do jogador troca-se o perfil. */
  const comoJogador = {
    profiles: [{ ...(FIXTURES_BASE.profiles[0] as Record<string, unknown>), role: 'player', roles: ['player'] }],
  }

  test('quem gere vê-o, marcado', async ({ page }) => {
    await montarSupabaseFalso(page, { events: [rascunho], callups: [] })
    await page.goto('/csc-vet/calendar')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Rascunho', { exact: true }).first()).toBeVisible()
  })

  test('quem não gere não o vê de todo', async ({ page }) => {
    await montarSupabaseFalso(page, { events: [rascunho], callups: [], ...comoJogador })
    await page.goto('/csc-vet/calendar')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(400)

    await expect(page.getByText('Jantar por confirmar')).toHaveCount(0)
    await expect(page.getByText('Rascunho', { exact: true })).toHaveCount(0)
  })
})

/**
 * O cartão da Agenda tem de dizer *quando*.
 *
 * Mostrava a hora e nunca o dia: a data só existia no `aria-label`, invisível.
 * Numa lista que percorre o mês inteiro, "18:00" sozinho não diz nada.
 */
test('o cartão da Agenda mostra o dia, e não só a hora', async ({ page }) => {
  const daquiATresDias = new Date(Date.now() + 3 * 864e5)
  const jogo = {
    ...base, id: 'dt', title: 'Jogo', type: 'match',
    date_time: daquiATresDias.toISOString(),
  }
  // Com convocados, para sair o cartão normal e não o de "Ninguém foi
  // convocado", que tem a data noutra forma.
  await montarSupabaseFalso(page, { events: [jogo], callups: [convocatoriaMinha('dt')] })
  await page.goto('/csc-vet/calendar')
  await page.waitForLoadState('networkidle')

  const esperado = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(daquiATresDias).replace(/\./g, '').toUpperCase()

  await expect(page.getByText(esperado, { exact: true }).first()).toBeVisible()
})

/**
 * O cartão de "Ninguém foi convocado" também é um evento.
 *
 * Só o botão "Convocar" era acionável: não havia como abrir o evento para o
 * ver ou editar, e é justamente o evento que mais precisa de ser mexido.
 */
test.describe('O cartão por convocar abre o evento', () => {
  const jogo = { ...base, id: 'pc', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(9) }

  test('tocar no cartão abre o detalhe', async ({ page }) => {
    await montarSupabaseFalso(page, { events: [jogo], callups: [] })
    await page.goto('/csc-vet/calendar')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /Ver jogo por convocar/ }).click()
    await expect(page).toHaveURL(/\?event=pc/)
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('o "Convocar" não abre o detalhe por baixo', async ({ page }) => {
    await montarSupabaseFalso(page, { events: [jogo], callups: [] })
    await page.goto('/csc-vet/calendar')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: 'Convocar' }).click()
    await expect(page).toHaveURL(/\/events\?convocatoria=pc/)
  })
})

/** Editar a partir da Agenda tem de poder pôr e tirar o rascunho. */
test('a edição na Agenda tem o rascunho', async ({ page }) => {
  const jogo = { ...base, id: 'ed', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(9) }
  await montarSupabaseFalso(page, { events: [jogo], callups: [convocatoriaMinha('ed')] })
  await page.goto('/csc-vet/calendar?event=ed')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Editar evento' }).click()
  const caixa = page.getByLabel(/Guardar como rascunho/)
  await expect(caixa).toBeVisible()
  await expect(caixa).not.toBeChecked()
})

/**
 * A Home não pergunta a mesma coisa duas vezes.
 *
 * O cartão de cima folheia os jogos marcados, cada um com Sim/Não. Um jogo
 * que já se pode responder ali não volta a aparecer em "Por responder" três
 * linhas abaixo, com os mesmos dois botões — sobram os convívios, e os jogos
 * que ficarem de fora do carrossel.
 */
test('um jogo do cartão de cima não se repete em "Por responder"', async ({ page }) => {
  const meu = (id: string) => ({
    id: 'k-' + id, event_id: id, player_id: UTILIZADOR_TESTE.id,
    status: 'called', responded_at: null, player: FIXTURES_BASE.profiles[0],
  })

  await montarSupabaseFalso(page, {
    events: [
      { ...base, id: 'g1', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(4) },
      { ...base, id: 'g2', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(18) },
      { ...base, id: 'cv', title: 'Jantar Reentré', type: 'gathering', date_time: DAQUI_A_DIAS(4) },
    ],
    callups: [meu('g1'), meu('g2'), meu('cv')],
  })
  await page.goto('/csc-vet/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)

  // Os dois jogos estão em cima: duas páginas no carrossel dos jogos.
  await expect(page.getByRole('group', { name: 'Próximos jogos' })).toBeVisible()

  // E "Por responder" fica só com o convívio.
  const porResponder = page.getByRole('group', { name: 'Compromissos por responder' })
  await expect(porResponder).toBeVisible()
  await expect(porResponder.getByText('Jantar Reentré')).toBeVisible()
  await expect(porResponder.getByText(/^Jogo com/)).toHaveCount(0)
})

/**
 * A Agenda abre no que está por realizar.
 *
 * A lista por baixo do calendário é ordenada por data, e a época tem meses
 * feitos: abrir em "Todos" era abrir num jogo de janeiro, com o próximo a
 * dezenas de cartões de distância.
 *
 * O calendário do mês fica **de fora** deste filtro, de propósito: se o tempo
 * se aplicasse também aos pontos, o mês em curso perdia os dias já passados e
 * escolher o dia de um jogo da semana anterior respondia "Sem eventos neste
 * dia" — que é falso.
 */
test.describe('A Agenda abre no que está por realizar', () => {
  const passado = { ...base, id: 'v', title: 'Convívio Antigo', type: 'gathering', date_time: DAQUI_A_DIAS(-9) }
  const futuro = { ...base, id: 'n', title: 'Convívio Novo', type: 'gathering', date_time: DAQUI_A_DIAS(9) }

  async function agenda(page: import('@playwright/test').Page, eventos: Record<string, unknown>[]) {
    await montarSupabaseFalso(page, {
      events: eventos,
      callups: eventos.map(e => convocatoriaMinha(e.id as string)),
    })
    await page.goto('/csc-vet/calendar')
    await page.waitForLoadState('networkidle')
  }

  test('a lista mostra o futuro e não o passado', async ({ page }) => {
    await agenda(page, [passado, futuro])

    await expect(page.getByRole('heading', { name: /por realizar/i })).toBeVisible()
    await expect(page.getByText('Convívio Novo')).toBeVisible()
    await expect(page.getByText('Convívio Antigo')).toHaveCount(0)
  })

  test('e o funil não acende: é o ponto de partida, não um filtro posto', async ({ page }) => {
    await agenda(page, [passado, futuro])

    await expect(page.getByRole('button', { name: 'Pesquisa e filtros', exact: true })).toBeVisible()
  })

  test('"Ver realizados" leva ao passado sem abrir a persiana', async ({ page }) => {
    await agenda(page, [passado, futuro])

    await page.getByRole('button', { name: 'Ver realizados' }).click()
    await expect(page.getByText('Convívio Antigo')).toBeVisible()
    await expect(page.getByText('Convívio Novo')).toHaveCount(0)
    // Agora sim, é um filtro escolhido — e o cabeçalho tem de o dizer.
    await expect(page.getByRole('button', { name: /Pesquisa e filtros \(ativos\)/ })).toBeVisible()
  })

  test('só com passado, o vazio oferece o histórico em vez de mentir', async ({ page }) => {
    await agenda(page, [passado])

    await expect(page.getByText('Nada por realizar.')).toBeVisible()
    await expect(page.getByText('Nada marcado ainda')).toHaveCount(0)

    await page.getByRole('button', { name: 'Ver os realizados' }).click()
    await expect(page.getByText('Convívio Antigo')).toBeVisible()
  })

  test('o calendário do mês continua a marcar os dias já passados', async ({ page }) => {
    const quando = new Date(Date.now() - 14 * 864e5)
    quando.setHours(11, 0, 0, 0)
    await agenda(page, [{ ...base, id: 'ps', title: 'Convívio Antigo', type: 'gathering', date_time: quando.toISOString() }])

    await page.getByLabel('Ano').selectOption(String(quando.getFullYear()))
    await page.getByLabel('Mês', { exact: true }).selectOption(String(quando.getMonth()))

    // O ponto está lá — e o dia abre o evento, em vez de dizer que não há nada.
    const dia = page.getByRole('button', { name: `${quando.getDate()} — 1 evento` })
    await expect(dia).toBeVisible()
    await dia.click()
    await expect(page.getByText('Convívio Antigo')).toBeVisible()
  })
})

/**
 * A convocatória não esconde quem entretanto ficou sem condições.
 *
 * A persiana filtrava a lista por elegibilidade: quem tivesse sido convocado
 * apto e ficasse lesionado depois desaparecia — da lista e das contagens. Em
 * produção, no jogo de 12/09, a Agenda dizia "22 convocados" e a persiana 19,
 * os 3 lesionados não tinham como ser tirados, e a recusa de um deles não
 * entrava nas contas.
 */
test.describe('Convocados que ficaram sem condições', () => {
  const LESIONADO = {
    id: '00000000-0000-4000-8000-0000000000ff',
    name: 'Rui Sousa', nickname: null, shirt_name: 'Sousa',
    jersey_number: 7, photo_url: null, position: 'Avançado',
    status: 'injured', role: 'player', roles: ['player'],
  }

  const jogo = { ...base, id: 'lz', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(6) }

  const fixtures = {
    events: [jogo],
    v_players_public: [
      ...(FIXTURES_BASE.v_players_public as Record<string, unknown>[]),
      LESIONADO,
    ],
    callups: [
      convocatoriaMinha('lz'),
      { id: 'c-lz-2', event_id: 'lz', player_id: LESIONADO.id, status: 'declined', responded_at: null, player: LESIONADO },
    ],
  }

  test('o cartão e a persiana dizem o mesmo número', async ({ page }) => {
    await montarSupabaseFalso(page, fixtures)
    await page.goto('/csc-vet/calendar')
    await page.waitForLoadState('networkidle')

    // O cartão da lista conta as duas linhas de `callups`.
    await expect(page.getByText('2 convocados').first()).toBeVisible()

    await page.goto('/csc-vet/calendar?event=lz')
    await page.waitForLoadState('networkidle')
    // E a persiana também — antes dizia 1.
    await expect(page.getByRole('dialog').getByText(/Convocatória \(2\)/)).toBeVisible()
  })

  test('o lesionado aparece marcado, e a recusa dele conta', async ({ page }) => {
    await montarSupabaseFalso(page, fixtures)
    await page.goto('/csc-vet/calendar?event=lz')
    await page.waitForLoadState('networkidle')

    const persiana = page.getByRole('dialog')
    await expect(persiana.getByText('1 sem condições')).toBeVisible()
    // A resposta que estava a ser engolida pelo filtro.
    await expect(persiana.getByText('1 recusado')).toBeVisible()

    await persiana.getByRole('button', { name: /Expandir|Recolher/ }).first().click()
    // A marca na linha do convocado — não o nome dele.
    await expect(persiana.getByText('Lesionado', { exact: true })).toBeVisible()
  })

  test('e há como atualizar a convocatória', async ({ page }) => {
    await montarSupabaseFalso(page, fixtures)
    await page.goto('/csc-vet/calendar?event=lz')
    await page.waitForLoadState('networkidle')

    const persiana = page.getByRole('dialog')
    await persiana.getByRole('button', { name: /Expandir|Recolher/ }).first().click()
    await expect(persiana.getByText('1 convocado sem condições')).toBeVisible()
    await persiana.getByRole('button', { name: 'Tirar', exact: true }).click()
    await expect(page.getByText(/Tirar da convocatória o convocado/)).toBeVisible()
  })
})

/**
 * Da Home chega-se ao evento.
 *
 * O cartão do próximo jogo e os cartões de "Por responder" mostravam o evento
 * e não abriam nada: para o ver ou editar era preciso ir à Agenda e procurá-lo.
 * Ambos levam agora ao detalhe pelo endereço (`/calendar?event=`), e os botões
 * de resposta e o link do Maps que têm lá dentro não podem abri-lo por trás.
 */
test.describe('A Home leva ao evento', () => {
  const jogo = { ...base, id: 'hj', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(5) }
  const convivio = { ...base, id: 'hc', title: 'Jantar Reentré', type: 'gathering', date_time: DAQUI_A_DIAS(7) }

  const fixtures = {
    events: [jogo, convivio],
    callups: [convocatoriaMinha('hj'), convocatoriaMinha('hc')],
  }

  async function home(page: import('@playwright/test').Page) {
    await montarSupabaseFalso(page, fixtures)
    await page.goto('/csc-vet/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
  }

  test('o cartão do próximo jogo abre o jogo', async ({ page }) => {
    await home(page)

    await page.getByRole('button', { name: /Ver o jogo/ }).click()
    await expect(page).toHaveURL(/\/calendar\?event=hj/)
  })

  test('um cartão de "Por responder" abre o seu evento', async ({ page }) => {
    await home(page)

    await page.getByRole('button', { name: /Ver convívio: Jantar Reentré/ }).click()
    await expect(page).toHaveURL(/\/calendar\?event=hc/)
  })

  test('responder não abre o evento por trás', async ({ page }) => {
    await home(page)

    // No cartão de cima…
    await page.getByRole('button', { name: 'Sim, vou' }).click()
    await page.waitForTimeout(400)
    await expect(page).toHaveURL(/\/csc-vet\/$/)

    // …e no de baixo.
    await page.getByRole('group', { name: 'Compromissos por responder' })
      .getByRole('button', { name: 'Vou' })
      .click()
    await page.waitForTimeout(400)
    await expect(page).toHaveURL(/\/csc-vet\/$/)
  })
})


/**
 * O treino responde-se, mas nunca sobe ao cartão de cima.
 *
 * O carrossel do topo da Home é dos jogos: um treino semanal a ocupar o lugar
 * do próximo jogo tirava à Home o que ela tem de dizer primeiro.
 */
test.describe('O treino na Home', () => {
  const meu = (id: string) => ({
    id: 'k-' + id, event_id: id, player_id: UTILIZADOR_TESTE.id,
    status: 'called', responded_at: null, player: FIXTURES_BASE.profiles[0],
  })

  test('dentro da janela, entra em "Por responder"', async ({ page }) => {
    const treino = { ...base, id: 'tr', title: 'Treino de terça', type: 'practice', date_time: DAQUI_A_DIAS(3) }
    await montarSupabaseFalso(page, { events: [treino], callups: [meu('tr')] })
    await page.goto('/csc-vet/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)

    const porResponder = page.getByRole('group', { name: 'Compromissos por responder' })
    await expect(porResponder.getByText('Treino de terça')).toBeVisible()

    // E não há carrossel de jogos: o treino não sobe lá.
    await expect(page.getByRole('group', { name: 'Próximos jogos' })).toHaveCount(0)
  })

  test('fora da janela, não entra', async ({ page }) => {
    const treino = { ...base, id: 'tr', title: 'Treino de terça', type: 'practice', date_time: DAQUI_A_DIAS(12) }
    await montarSupabaseFalso(page, { events: [treino], callups: [meu('tr')] })
    await page.goto('/csc-vet/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)

    await expect(page.getByText('Treino de terça')).toHaveCount(0)
  })
})

/**
 * A contagem de quem respondeu é de quem gere.
 *
 * Ao atleta, "0 confirmados" colado a "Contamos contigo?" é a prova de que
 * ninguém responde, no exato momento em que lhe pedimos que responda — numa
 * base com 1191 convocatórias por responder para 9 respostas, é o que ele leria
 * quase sempre. A regra já valia nas pastilhas do cabeçalho do cartão da lista;
 * faltava aqui, e foi a crítica de 2026-09-11 que a apanhou.
 *
 * No lugar da contagem, o atleta recebe o que lhe falta e a app sempre soube:
 * o prazo para responder.
 */
test.describe('A contagem de respostas é de quem gere', () => {
  const jogo = {
    ...base, id: 'cg', title: null, type: 'match',
    date_time: DAQUI_A_DIAS(4), opponent_id: null,
  }
  const outroAtleta = { id: 'p-2', name: 'Outro Atleta', role: 'player', roles: ['player'], status: 'active' }
  const convocatorias = [
    convocatoriaMinha('cg'),
    { id: 'c-2', event_id: 'cg', player_id: 'p-2', status: 'called', responded_at: null, player: outroAtleta },
  ]

  const comoJogador = {
    profiles: [{ ...EU, role: 'player', roles: ['player'] }, outroAtleta],
    v_players_public: [{ ...EU, role: 'player', roles: ['player'] }, outroAtleta],
  }

  test('o atleta não lê zeros — lê o prazo', async ({ page }) => {
    await montarSupabaseFalso(page, { events: [jogo], callups: convocatorias, ...comoJogador })
    await page.goto('/csc-vet/calendar')
    await expect(page.getByText(/Contamos contigo\?/).first()).toBeVisible()

    await expect(page.getByText(/confirmados/)).toHaveCount(0)
    await expect(page.getByText(/sem resposta/i)).toHaveCount(0)
    await expect(page.getByText(/Responde até/).first()).toBeVisible()
  })

  test('quem gere continua a ver a contagem', async ({ page }) => {
    await montarSupabaseFalso(page, { events: [jogo], callups: convocatorias })
    await page.goto('/csc-vet/calendar')
    await expect(page.getByText(/Contamos contigo\?/).first()).toBeVisible()

    await expect(page.getByText(/0 confirmados/).first()).toBeVisible()
  })

  test('na persiana, o atleta não leva a contagem por responder', async ({ page }) => {
    await montarSupabaseFalso(page, { events: [jogo], callups: convocatorias, ...comoJogador })
    await page.goto('/csc-vet/calendar?event=cg')
    await expect(page.getByRole('dialog')).toBeVisible()

    const persiana = page.getByRole('dialog')
    await expect(persiana.getByText(/Convocatória \(2/)).toBeVisible()
    await expect(persiana.getByText(/sem resposta/i)).toHaveCount(0)
    await expect(persiana.getByText(/0 confirmados/)).toHaveCount(0)
  })
})

/**
 * A minha convocatória é a que tem o meu `id`, e mais nada.
 *
 * A app procurava-a também pelo nome e pelo email do atleta. Dois sócios com o
 * mesmo nome — e um clube de bairro tem-nos — viam a convocatória um do outro
 * como sendo sua; o `profiles.email` é escrevível pelo próprio, por isso
 * também não prova identidade nenhuma. A RLS impedia a escrita na linha
 * errada, portanto não era um buraco de segurança: era a app a mostrar a
 * pergunta de outra pessoa e a não fazer nada quando se respondia.
 *
 * É a mesma lição que tirou o telefone e o nome da associação de conta a
 * ficha, aplicada ao outro sítio onde ainda vivia.
 */
test.describe('Homónimos não respondem um pelo outro', () => {
  const MESMO_NOME = 'João Silva'

  /* O convocado é o outro João, e não eu. */
  const outroJoao = {
    id: 'p-homonimo',
    name: MESMO_NOME,
    email: UTILIZADOR_TESTE.email,
    role: 'player', roles: ['player'], status: 'active', jersey_number: 7,
  }
  const eu = { ...EU, name: MESMO_NOME, role: 'player', roles: ['player'] }

  const jogo = {
    ...base, id: 'hm', title: null, type: 'match',
    date_time: DAQUI_A_DIAS(3), opponent_id: null,
  }

  /*
    O outro João já respondeu que sim. Eu não respondi nada — e é isso que o
    cartão me tem de dizer. Com a procura por nome, a app dava a resposta dele
    como minha: "Disseste que sim" a quem nunca tocou no botão.

    (Um atleta apto que não foi convocado recebe a pergunta à mesma e pode
    inscrever-se: é outra decisão desta app, e não é o que aqui se testa.)
  */
  test('a resposta do outro não é a minha', async ({ page }) => {
    /* Os dois convocados, com o mesmo nome. Ele disse que sim; eu não
       respondi — e é a minha linha que o cartão tem de ler. */
    await montarSupabaseFalso(page, {
      events: [jogo],
      callups: [
        {
          id: 'c-outro', event_id: 'hm', player_id: outroJoao.id,
          status: 'confirmed', responded_at: new Date().toISOString(), player: outroJoao,
        },
        {
          id: 'c-eu', event_id: 'hm', player_id: UTILIZADOR_TESTE.id,
          status: 'called', responded_at: null, player: eu,
        },
      ],
      profiles: [eu, outroJoao],
      v_players_public: [eu, outroJoao],
    })
    await page.goto('/csc-vet/calendar')
    await expect(page.getByText('POR REALIZAR')).toBeVisible()

    await expect(page.getByText(/Contamos contigo\?/).first()).toBeVisible()
    await expect(page.getByText(/Contamos contigo\.|Ficas de fora/)).toHaveCount(0)
  })
})

/**
 * Quem escolhe quem joga é quem treina.
 *
 * O cartão e a persiana tinham uma segunda regra, mais larga do que a do
 * `getMyCallupForEvent`: sem convocatória minha, inventavam-me uma sempre que
 * eu fosse jogador — fosse qual fosse o evento. Num treino isso é a regra do
 * clube, que convoca automaticamente todos os aptos. Num **jogo** dava a
 * qualquer jogador a pergunta "Contamos contigo?" sem ninguém o ter chamado, e
 * responder inscrevia-o na convocatória.
 */
test.describe('Um jogo só pergunta a quem foi convocado', () => {
  const outro = {
    id: 'p-outro', name: 'Outro Atleta', role: 'player', roles: ['player'],
    status: 'active', jersey_number: 7,
  }
  const euJogador = { ...EU, role: 'player', roles: ['player'] }

  const comOutroConvocado = (eventId: string) => ({
    profiles: [euJogador, outro],
    v_players_public: [euJogador, outro],
    callups: [{
      id: 'c-outro', event_id: eventId, player_id: outro.id,
      status: 'called', responded_at: null, player: outro,
    }],
  })

  test('não fui convocado para o jogo, não me perguntam nada', async ({ page }) => {
    const jogo = { ...base, id: 'jg', title: null, type: 'match', date_time: DAQUI_A_DIAS(3), opponent_id: null }
    await montarSupabaseFalso(page, { events: [jogo], ...comOutroConvocado('jg') })
    await page.goto('/csc-vet/calendar')
    await expect(page.getByText('POR REALIZAR')).toBeVisible()

    await expect(page.getByText(/Contamos contigo\?/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sim, vou' })).toHaveCount(0)
  })

  test('nem na persiana do jogo', async ({ page }) => {
    const jogo = { ...base, id: 'jg', title: null, type: 'match', date_time: DAQUI_A_DIAS(3), opponent_id: null }
    await montarSupabaseFalso(page, { events: [jogo], ...comOutroConvocado('jg') })
    await page.goto('/csc-vet/calendar?event=jg')
    await expect(page.getByRole('dialog')).toBeVisible()

    await expect(page.getByRole('dialog').getByText(/Contamos contigo\?/)).toHaveCount(0)
    /* E não fica calada: quem abre o jogo tem de perceber porquê. */
    await expect(page.getByRole('dialog').getByText(/Não estás nesta convocatória/)).toBeVisible()
  })

  test('mas o treino continua a perguntar a todos os aptos', async ({ page }) => {
    const treino = { ...base, id: 'tr', title: 'Treino', type: 'practice', date_time: DAQUI_A_DIAS(2) }
    await montarSupabaseFalso(page, { events: [treino], ...comOutroConvocado('tr') })
    await page.goto('/csc-vet/calendar')
    await expect(page.getByText(/Contamos contigo\?/).first()).toBeVisible()
  })
})
