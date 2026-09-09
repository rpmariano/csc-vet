import { test, expect, type Locator, type Page } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * Teste de fumo dos diálogos: cada um tem de se anunciar como diálogo, ter um
 * nome acessível, receber o foco ao abrir e reagir ao Escape. É a rede de
 * segurança do useModalA11y — sem ela, um modal escrito à mão volta a passar
 * despercebido.
 */

const dialogos = (page: Page) => page.locator('[role="dialog"]')

/** Nome acessível: `aria-label`, ou o texto do elemento apontado por `aria-labelledby`. */
function nomeAcessivel(painel: Locator) {
  return painel.evaluate(el => {
    const rotulo = el.getAttribute('aria-label')
    if (rotulo) return rotulo
    const id = el.getAttribute('aria-labelledby')
    return id ? (document.getElementById(id)?.textContent ?? '').trim() : ''
  })
}

/**
 * O foco está dentro **deste** painel?
 *
 * Media antes se estava dentro de *algum* `[role="dialog"]`, o que com
 * diálogos empilhados dava verde mesmo que o foco tivesse ficado no de baixo —
 * e é aí que interessa: quem abre uma confirmação por cima de um formulário
 * tem de continuar a navegar na confirmação, não no que está por trás.
 */
const focoDentro = (painel: Locator) =>
  painel.evaluate(el => el === document.activeElement || el.contains(document.activeElement))

/** O contrato que todos partilham, sem assumir o que o Escape faz a seguir. */
async function verificaContrato(painel: Locator) {
  await expect(painel).toBeVisible()
  await expect(painel).toHaveAttribute('aria-modal', 'true')
  expect(await nomeAcessivel(painel), 'o diálogo tem de ter nome acessível').not.toBe('')
  // O foco entra no diálogo: sem isto o teclado continuava na página por baixo.
  await expect.poll(() => focoDentro(painel), { timeout: 2000 }).toBe(true)
}

/** Diálogo simples: abre, cumpre o contrato e fecha com Escape. */
async function verificaDialogo(page: Page, abrir: () => Promise<void>) {
  const antes = await dialogos(page).count()
  await abrir()
  await expect(dialogos(page)).toHaveCount(antes + 1)
  await verificaContrato(dialogos(page).last())
  await page.keyboard.press('Escape')
  await expect(dialogos(page)).toHaveCount(antes)
}

async function abrePagina(page: Page, caminho: string, fixtures = {}) {
  await montarSupabaseFalso(page, fixtures)
  await page.goto(caminho)
  await page.waitForLoadState('networkidle')
  // Continuar na rota pedida (e não em /login) é a prova de que a sessão falsa
  // pegou. O caminho vai escapado: os que trazem `?` e `&` são metacaracteres
  // de expressão regular e davam um teste que nunca casava.
  await expect(page).toHaveURL(url => url.pathname + url.search === `/csc-vet/${caminho}`)
}

/*
  As quatro áreas de gestão deixaram de ser separadores de um "painel de
  administração" e passaram a secções do ecrã Clube, cada uma no seu `?ver=`.
*/
test.describe('Gestão do Clube', () => {
  test('criar campo, adversário e torneio', async ({ page }) => {
    await abrePagina(page, 'clube?ver=campos')
    await verificaDialogo(page, () => page.getByRole('button', { name: 'Criar campo' }).click())

    await abrePagina(page, 'clube?ver=adversarios')
    await verificaDialogo(page, () => page.getByRole('button', { name: 'Criar adversário' }).click())

    await abrePagina(page, 'clube?ver=torneios')
    await verificaDialogo(page, () => page.getByRole('button', { name: 'Criar torneio' }).click())
  })

  test('Escape num formulário sujo pede confirmação, e só fecha essa', async ({ page }) => {
    await abrePagina(page, 'clube?ver=campos')

    await page.getByRole('button', { name: 'Criar campo' }).click()
    const painelCampo = dialogos(page).first()
    await expect(painelCampo).toBeVisible()

    // Sujar o formulário: agora o fecho tem de ser deliberado.
    await painelCampo.getByRole('textbox').first().fill('Campo de Teste')

    await page.keyboard.press('Escape')
    // Dois diálogos: o formulário continua aberto, com a confirmação por cima.
    await expect(dialogos(page)).toHaveCount(2)

    // O segundo Escape fecha só a confirmação — não os dois de uma vez.
    await page.keyboard.press('Escape')
    await expect(dialogos(page)).toHaveCount(1)
    await expect(painelCampo).toBeVisible()
  })
})

test.describe('Plantel', () => {
  test('criar ficha de membro', async ({ page }) => {
    await abrePagina(page, 'team-management')
    await verificaDialogo(page, () => page.getByRole('button', { name: /Adicionar membro ao plantel/ }).first().click())
  })
})

test.describe('Comunicados', () => {
  const comunicado = {
    id: 'a1',
    title: 'Aviso de teste',
    content: 'Conteúdo do aviso de teste.',
    created_at: new Date().toISOString(),
    is_active: true,
    priority: 'normal',
    author_id: null,
  }

  test('editar e apagar comunicado', async ({ page }) => {
    await abrePagina(page, 'announcements', { announcements: [comunicado] })

    await verificaDialogo(page, () => page.getByRole('button', { name: 'Editar' }).first().click())
    await verificaDialogo(page, () => page.getByRole('button', { name: 'Apagar' }).first().click())
  })
})

test.describe('Eventos', () => {
  const treinoDaLista = {
    id: 'e9', title: 'Treino de teste', type: 'practice',
    date_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    location: 'Campo de Teste', description: null, field_id: null, opponent_id: null,
    tournament_id: null, home_away: 'home', is_friendly: false, max_players: null,
    meeting_time: null, home_score: null, away_score: null, is_active: true,
  }

  test('criar evento', async ({ page }) => {
    await abrePagina(page, 'events')
    await verificaDialogo(page, () => page.getByRole('button', { name: 'Novo Evento' }).first().click())
  })

  /*
    O cartão inteiro abre o detalhe, e é lá dentro que se edita ou elimina —
    o lápis e o caixote saíram da lista, onde se carregava neles sem sequer
    ver de que evento se tratava.
  */
  test('o cartão da lista abre o detalhe, e é lá que se edita', async ({ page }) => {
    await abrePagina(page, 'events', { events: [treinoDaLista] })

    const cartao = page.getByRole('button', { name: /^Ver os detalhes de / }).first()
    await expect(cartao).toBeVisible()
    // Na lista não há atalhos destrutivos.
    await expect(page.getByRole('button', { name: 'Eliminar evento' })).toHaveCount(0)

    /* Sem o `verificaDialogo`: ele fecha com Escape no fim, e o fecho tira o
       `?convocatoria=` do endereço antes de se poder verificar. */
    const antes = await dialogos(page).count()
    await cartao.click()
    await expect(dialogos(page)).toHaveCount(antes + 1)
    await verificaContrato(dialogos(page).last())
    await expect(page).toHaveURL(/convocatoria=e9/)

    // Editar e eliminar vivem no detalhe.
    await expect(dialogos(page).last().getByRole('button', { name: 'Modificar evento' })).toBeVisible()
    await expect(dialogos(page).last().getByRole('button', { name: 'Apagar evento' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialogos(page)).toHaveCount(antes)
  })
})

test.describe('Calendário', () => {
  const treino = {
    id: 'e1',
    title: 'Treino de teste',
    type: 'practice',
    date_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    location: 'Campo de Teste',
    description: null,
    field_id: null,
    opponent_id: null,
    tournament_id: null,
    home_away: 'home',
    is_friendly: false,
    max_players: null,
    meeting_time: null,
    home_score: null,
    away_score: null,
  }

  /** Cartão do evento (abre a persiana) → botão Modificar. */
  async function abreEdicaoDoEvento(page: Page) {
    /* Ao pé do topo do cartão, e não no centro: o centro é a linha do
       campo, que é um link para o Maps e pára o clique de subir. */
    await page.getByRole('button', { name: /^Ver / }).first()
      .click({ position: { x: 30, y: 12 } })
    await page.getByRole('button', { name: 'Editar evento' }).click()
  }

  // A contagem de partida conta já com a persiana do detalhe, aberta pelo
  // caminho acima; o que se verifica é o que se empilha por cima dela.
  test('editar evento', async ({ page }) => {
    await abrePagina(page, 'calendar', { events: [treino] })
    await abreEdicaoDoEvento(page)

    const base = await dialogos(page).count()
    await verificaContrato(dialogos(page).last())

    // A edição fecha-se sempre de forma deliberada: o Escape pede confirmação.
    await page.keyboard.press('Escape')
    await expect(dialogos(page)).toHaveCount(base + 1)

    // E o Escape seguinte fecha só essa confirmação.
    await page.keyboard.press('Escape')
    await expect(dialogos(page)).toHaveCount(base)
  })

  test('criar campo a partir da edição do evento', async ({ page }) => {
    await abrePagina(page, 'calendar', { events: [treino] })
    await abreEdicaoDoEvento(page)
    const base = await dialogos(page).count()

    // O select do campo abre a janela de criação rápida por cima da edição.
    await page.locator('select').filter({ hasText: 'Criar Novo Campo' }).first().selectOption('__new__')
    await expect(dialogos(page)).toHaveCount(base + 1)
    const painelCampo = dialogos(page).last()
    await verificaContrato(painelCampo)
    await expect(painelCampo).toContainText('Criar Novo Campo / Instalação')

    // Escape fecha só a janela de cima; a edição continua aberta por baixo.
    await page.keyboard.press('Escape')
    await expect(dialogos(page)).toHaveCount(base)
  })
})

/**
 * Persianas abertas pelo endereço, e não por um clique.
 *
 * O `verificaContrato` já exigia o foco lá dentro, mas todos os casos acima
 * abrem com um clique — e por um clique o foco sempre entrou. Estas abrem por
 * navegação direta, que é o caminho de um link partilhado ou de um retroceder,
 * e é aí que falhava: o `useModalA11y` tentava focar uma vez com
 * `setTimeout(…, 0)` e desistia em silêncio se a ref do painel ainda não
 * existisse. Como o `BottomSheet` monta o painel num segundo passo para animar
 * a entrada, isso acontecia a maior parte das vezes: medido em 12 aberturas, a
 * ficha do adversário deixava o foco no `<body>` em 10 e a do campo em 7.
 *
 * Repete-se cada uma **quatro vezes** de propósito: era uma corrida, e uma
 * passagem única voltaria a dar verde com o bug lá.
 */
test.describe('Persianas abertas pelo endereço', () => {
  const campo = { id: 'f1', name: 'Estádio Municipal', address: 'Rua da Bela Vista, 2750-343 Cascais' }
  const adversario = {
    id: 'o1', name: 'Sesimbra Veteranos', initials: 'SES', logo_url: null,
    contact_name: 'João', contact_phone: '967 000 111', home_field_id: 'f1',
  }

  const jogo = {
    id: 'j1', title: 'Jogo de teste', type: 'match',
    date_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    location: 'Campo de Teste', description: null, field_id: null, opponent_id: 'o1',
    tournament_id: null, home_away: 'home', is_friendly: false, max_players: null,
    meeting_time: null, home_score: 2, away_score: 1, is_active: true,
  }

  const evento = {
    id: 'e1', title: 'Treino de teste', type: 'practice',
    date_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    location: 'Campo de Teste', description: null, field_id: null, opponent_id: null,
    tournament_id: null, home_away: 'home', is_friendly: false, max_players: null,
    meeting_time: null, home_score: null, away_score: null,
  }

  const casos: [string, string][] = [
    ['ficha do adversário', 'clube?ver=adversarios&adversario=o1'],
    ['ficha do campo', 'clube?ver=campos&campo=f1'],
    ['detalhe do evento', 'calendar?event=e1'],
    ['ficha de atleta', `team-management?atleta=${UTILIZADOR_TESTE.id}`],
    ['dossier de convocatória', 'events?convocatoria=e1'],
    ['ficha de jogo', 'competicao?ver=fichas&jogo=j1'],
  ]

  for (const [nome, caminho] of casos) {
    test(`o foco entra na ${nome}`, async ({ page }) => {
      for (let i = 0; i < 4; i++) {
        await abrePagina(page, caminho, { fields: [campo], opponents: [adversario], events: [evento, jogo] })
        await verificaContrato(dialogos(page).last())
      }
    })
  }
})

/**
 * Uma persiana sobe sempre até meio do ecrã.
 *
 * Sem altura mínima o painel agarrava-se ao conteúdo: uma persiana curta —
 * dois comunicados, três pagamentos — abria uma tira colada ao fundo do
 * telemóvel, com o título à altura dos botões do sistema e a lista dentro do
 * bezel. O `max-h` continua a limitar as compridas.
 */
test.describe('Altura da persiana', () => {
  const campo = { id: 'f1', name: 'Campo de Teste', address: 'R. do Teste' }

  test('mesmo com pouco conteúdo, ocupa metade do ecrã', async ({ page }) => {
    await abrePagina(page, 'clube?ver=campos&campo=f1', { fields: [campo] })

    const painel = page.getByRole('dialog').last()
    await expect(painel).toBeVisible()

    const caixa = await painel.boundingBox()
    const janela = page.viewportSize()
    if (!caixa || !janela) throw new Error('sem medidas')

    expect(caixa.height / janela.height).toBeGreaterThanOrEqual(0.5)
    // E o topo do painel fica acima do meio do ecrã.
    expect(caixa.y).toBeLessThanOrEqual(janela.height / 2)
  })
})
