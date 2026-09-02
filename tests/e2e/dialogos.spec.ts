import { test, expect, type Page } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * Teste de fumo dos diálogos: cada um tem de se anunciar como diálogo, ter um
 * nome acessível, receber o foco ao abrir, fechar com Escape e devolver o foco
 * a quem o abriu. É a rede de segurança do useModalA11y — sem ela, um modal
 * escrito à mão volta a passar despercebido.
 */

const dialogo = (page: Page) => page.locator('[role="dialog"]')

/** Nome acessível: `aria-label`, ou o texto do elemento apontado por `aria-labelledby`. */
async function nomeAcessivel(page: Page) {
  return dialogo(page).first().evaluate(el => {
    const rotulo = el.getAttribute('aria-label')
    if (rotulo) return rotulo
    const id = el.getAttribute('aria-labelledby')
    return id ? (document.getElementById(id)?.textContent ?? '').trim() : ''
  })
}

const focoDentroDoDialogo = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))

/**
 * Abre um diálogo pelo seu botão, verifica-o e fecha-o com Escape.
 */
async function verificaDialogo(page: Page, abrir: () => Promise<void>) {
  await expect(dialogo(page)).toHaveCount(0)

  await abrir()
  const painel = dialogo(page).first()
  await expect(painel).toBeVisible()
  await expect(painel).toHaveAttribute('aria-modal', 'true')
  expect(await nomeAcessivel(page), 'o diálogo tem de ter nome acessível').not.toBe('')

  // O foco entra no diálogo: sem isto o teclado continuava na página por baixo.
  await expect.poll(() => focoDentroDoDialogo(page), { timeout: 2000 }).toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialogo(page)).toHaveCount(0)
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
    const painelCampo = dialogo(page).first()
    await expect(painelCampo).toBeVisible()

    // Sujar o formulário: agora o fecho tem de ser deliberado.
    await painelCampo.getByRole('textbox').first().fill('Campo de Teste')

    await page.keyboard.press('Escape')
    // Dois diálogos: o formulário continua aberto, com a confirmação por cima.
    await expect(dialogo(page)).toHaveCount(2)

    // O segundo Escape fecha só a confirmação — não os dois de uma vez.
    await page.keyboard.press('Escape')
    await expect(dialogo(page)).toHaveCount(1)
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
