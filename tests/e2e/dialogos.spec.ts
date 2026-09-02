import { test, expect, type Locator, type Page } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

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

const focoDentroDoDialogo = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))

/** O contrato que todos partilham, sem assumir o que o Escape faz a seguir. */
async function verificaContrato(page: Page, painel: Locator) {
  await expect(painel).toBeVisible()
  await expect(painel).toHaveAttribute('aria-modal', 'true')
  expect(await nomeAcessivel(painel), 'o diálogo tem de ter nome acessível').not.toBe('')
  // O foco entra no diálogo: sem isto o teclado continuava na página por baixo.
  await expect.poll(() => focoDentroDoDialogo(page), { timeout: 2000 }).toBe(true)
}

/** Diálogo simples: abre, cumpre o contrato e fecha com Escape. */
async function verificaDialogo(page: Page, abrir: () => Promise<void>) {
  const antes = await dialogos(page).count()
  await abrir()
  await expect(dialogos(page)).toHaveCount(antes + 1)
  await verificaContrato(page, dialogos(page).last())
  await page.keyboard.press('Escape')
  await expect(dialogos(page)).toHaveCount(antes)
}

async function abrePagina(page: Page, caminho: string, fixtures = {}) {
  await montarSupabaseFalso(page, fixtures)
  await page.goto(caminho)
  await page.waitForLoadState('networkidle')
  // Continuar na rota pedida (e não em /login) é a prova de que a sessão falsa pegou.
  await expect(page).toHaveURL(new RegExp(`/${caminho}$`))
}

test.describe('Painel de administração', () => {
  test('criar campo, adversário e torneio', async ({ page }) => {
    await abrePagina(page, 'admin')

    await verificaDialogo(page, () => page.getByRole('button', { name: 'Novo Campo' }).first().click())

    await page.getByRole('button', { name: /^Adversários/ }).click()
    await verificaDialogo(page, () => page.getByRole('button', { name: /Novo Adversário/ }).first().click())

    await page.getByRole('button', { name: /^Torneios/ }).click()
    await verificaDialogo(page, () => page.getByRole('button', { name: /Novo Torneio/ }).first().click())
  })

  test('Escape num formulário sujo pede confirmação, e só fecha essa', async ({ page }) => {
    await abrePagina(page, 'admin')

    await page.getByRole('button', { name: 'Novo Campo' }).first().click()
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
    await verificaDialogo(page, () => page.getByRole('button', { name: /Adicionar Membro/ }).first().click())
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
  test('criar evento', async ({ page }) => {
    await abrePagina(page, 'events')
    await verificaDialogo(page, () => page.getByRole('button', { name: 'Novo Evento' }).first().click())
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

  /** Lista → cartão do evento (abre a persiana) → botão Modificar. */
  async function abreEdicaoDoEvento(page: Page) {
    await page.getByRole('button', { name: /^Lista/ }).click()
    await page.locator('div.cursor-pointer.bg-csc-dark').first().click()
    await page.getByTitle('Modificar evento').click()
  }

  // O detalhe do evento é diálogo no telemóvel e página no desktop, por isso a
  // contagem de partida difere; o que se verifica é sempre o que se empilha
  // por cima dela.
  test('editar evento', async ({ page }) => {
    await abrePagina(page, 'calendar', { events: [treino] })
    await abreEdicaoDoEvento(page)

    const base = await dialogos(page).count()
    await verificaContrato(page, dialogos(page).last())

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
    await verificaContrato(page, painelCampo)
    await expect(painelCampo).toContainText('Criar Novo Campo / Instalação')

    // Escape fecha só a janela de cima; a edição continua aberta por baixo.
    await page.keyboard.press('Escape')
    await expect(dialogos(page)).toHaveCount(base)
  })
})
