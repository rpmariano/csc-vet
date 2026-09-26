import { test, expect, type Page } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * Ver um evento ou uma ficha de atleta é navegar, não abrir uma janela.
 *
 * A ficha é um ecrã (`<EcraDetalhe>`), com endereço próprio (`?event=`,
 * `?atleta=`…), para o botão de retroceder do browser voltar à lista. Até
 * 2026-09-25 era uma persiana — um diálogo modal —, e o contrato aqui era o de
 * um diálogo; hoje é o de uma página: título principal com o nome, foco nele
 * ao abrir, nenhum diálogo, e a lista escondida por baixo.
 *
 * Havia aqui duas versões deste contrato — persiana no telemóvel, página no
 * desktop. Com o redesenho de 2026 a app passou a ter uma só UI, e estes
 * testes correm nos dois projetos (`desktop` 1280px e `telemovel`) sem
 * ramificar: é isso, agora, que garante que a largura da janela não muda nada.
 */

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

const jogo = {
  id: 'j1',
  title: 'Jogo de teste',
  type: 'match',
  date_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  location: 'Campo de Teste',
  description: null,
  field_id: null,
  opponent_id: null,
  tournament_id: null,
  home_away: 'home',
  is_friendly: false,
  max_players: null,
  meeting_time: null,
  home_score: 2,
  away_score: 1,
  is_active: true,
}

async function abrePagina(page: Page, caminho: string, fixtures = {}) {
  await montarSupabaseFalso(page, fixtures)
  await page.goto(caminho)
  await page.waitForLoadState('networkidle')
}

/** O contrato do ecrã de uma ficha, em qualquer largura de janela. */
async function verificaDetalhe(page: Page, nome: string | RegExp, textoNoDetalhe: string, paramEsperado: RegExp) {
  await expect(page).toHaveURL(paramEsperado)

  // O nome é o título principal do ecrã, e é lá que o foco entra.
  const titulo = page.getByRole('heading', { level: 1, name: nome })
  await expect(titulo).toBeVisible()
  await expect(titulo).toBeFocused()
  // Dentro da ficha: a lista escondida por baixo pode ter o mesmo texto.
  await expect(page.getByRole('region', { name: nome }).getByText(textoNoDetalhe).first()).toBeVisible()

  // Um só título principal — o da lista está escondido por baixo — e nenhum
  // diálogo: a ficha deixou de ser persiana.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
}

/** De volta à lista: a ficha saiu e a lista voltou a ver-se. */
async function verificaLista(page: Page, url: RegExp, titulo: string | RegExp) {
  await expect(page).toHaveURL(url)
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
}

test.describe('Detalhe do evento', () => {
  test('abre com endereço próprio e volta ao retroceder', async ({ page }) => {
    await abrePagina(page, 'calendar', { events: [treino] })

    await expect(page).toHaveURL(/calendar$/)
    /* Ao pé do topo do cartão, e não no centro: o centro é a linha do
       campo, que é um link para o Maps e pára o clique de subir. */
    await page.getByRole('button', { name: /^Ver / }).first()
      .click({ position: { x: 30, y: 12 } })

    await verificaDetalhe(page, 'Treino de teste', 'Campo de Teste', /\?event=e1$/)

    // Retroceder no browser volta à agenda, e não fica um ecrã em branco.
    await page.goBack()
    await verificaLista(page, /calendar$/, 'Agenda')
    await expect(page.getByPlaceholder('Título, adversário ou local')).toBeVisible()
  })

  test('o endereço abre o evento diretamente', async ({ page }) => {
    await abrePagina(page, 'calendar?event=e1', { events: [treino] })
    await verificaDetalhe(page, 'Treino de teste', 'Campo de Teste', /\?event=e1$/)
  })

  test('o "‹ Agenda" volta à lista e devolve o foco ao cartão', async ({ page }) => {
    await abrePagina(page, 'calendar', { events: [treino] })
    /* Marca-se o cartão tocado: escolhido o dia, o painel do dia passa a ter
       um cartão igual, e um `.first()` resolvido outra vez apontava para ele. */
    await page.getByRole('button', { name: /^Ver / }).first().evaluate(el => el.setAttribute('data-tocado', ''))
    const cartao = page.locator('[data-tocado]')
    await cartao.focus()
    await page.keyboard.press('Enter')
    await verificaDetalhe(page, 'Treino de teste', 'Campo de Teste', /\?event=e1$/)

    await page.getByRole('button', { name: 'Agenda', exact: true }).click()
    await verificaLista(page, /calendar$/, 'Agenda')
    await expect(cartao).toBeFocused()
  })
})

test.describe('Ficha de atleta', () => {
  test('abre com endereço próprio e volta ao retroceder', async ({ page }) => {
    await abrePagina(page, 'team-management')
    // Pelo papel e pelo nome: o seletor por classe partiu-se em cada
    // redesenho da linha (ver a convenção no CLAUDE.md).
    await page.getByRole('button', { name: /^Ver a ficha de / }).first().click()

    await verificaDetalhe(page, /./, 'Gestão do atleta', /\?atleta=/)

    await page.goBack()
    await verificaLista(page, /team-management$/, 'Plantel')
  })
})

test.describe('Dossier de convocatória', () => {
  const porRealizar = { ...jogo, id: 'e2', date_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), home_score: null, away_score: null }

  test('abre com endereço próprio e volta ao retroceder', async ({ page }) => {
    await abrePagina(page, 'events', { events: [porRealizar] })
    // O cartão inteiro é que abre o dossier; o botão "Ver Detalhes & RSVP"
    // saiu, porque duplicava o que o cartão passou a fazer.
    await page.getByRole('button', { name: /^Ver os detalhes de / }).first().click()

    await verificaDetalhe(page, 'Jogo de teste', 'Confirmados', /\?convocatoria=e2$/)

    // Os Eventos voltaram a ter título (o cabeçalho de todos, 2026-09-26).
    await page.goBack()
    await verificaLista(page, /events$/, 'Eventos')
  })
})

test.describe('Ficha de jogo', () => {
  test('abre com endereço próprio e volta ao retroceder', async ({ page }) => {
    await abrePagina(page, 'competicao?ver=fichas', { events: [jogo] })
    // Pelo papel e pelo nome, não pela classe: o cartão já se partiu duas vezes
    // por o seletor estar preso ao aspeto (ver a convenção no CLAUDE.md).
    await page.getByRole('button', { name: /ficha do jogo com/ }).click()

    await verificaDetalhe(page, / vs /, 'Ficha oficial de jogo', /ver=fichas&jogo=j1$/)

    await page.goBack()
    await verificaLista(page, /ver=fichas$/, 'Competição')
  })
})

/* As fichas do adversário (9h) e do campo (9i) seguem o mesmo contrato. */
const campo = { id: 'f1', name: 'Estádio Municipal', address: 'Rua da Bela Vista, 2750-343 Cascais' }
const adversario = {
  id: 'o1',
  name: 'Sesimbra Veteranos',
  initials: 'SES',
  logo_url: null,
  contact_name: 'João',
  contact_phone: '967 000 111',
  home_field_id: 'f1',
}

test.describe('Ficha do adversário', () => {
  test('abre com endereço próprio e volta ao retroceder', async ({ page }) => {
    await abrePagina(page, 'clube?ver=adversarios', { opponents: [adversario], fields: [campo] })
    await page.getByRole('button', { name: /^Ver a ficha do adversário / }).first().click()

    await verificaDetalhe(page, /Sesimbra Veteranos/, 'Jogos entre nós', /adversario=o1/)

    await page.goBack()
    await verificaLista(page, /ver=adversarios$/, 'Adversários')
  })
})

test.describe('Ficha do campo', () => {
  test('abre com endereço próprio e volta ao retroceder', async ({ page }) => {
    await abrePagina(page, 'clube?ver=campos', { fields: [campo] })
    await page.getByRole('button', { name: /^Ver a ficha do campo / }).first().click()

    await verificaDetalhe(page, /Estádio Municipal/, 'Próximos eventos aqui', /campo=f1/)

    await page.goBack()
    await verificaLista(page, /ver=campos$/, 'Campos')
  })
})
