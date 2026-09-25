import { test, expect } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * A folha do [+] abre o formulário, e não a lista.
 *
 * Escolher "Jogo" mandava para `/events?criar=match`, mas a página ignorava o
 * parâmetro: quem pedia para criar um jogo era posto na gestão de eventos, com
 * o formulário a um toque de distância e sem nada a dizer que tinha de o
 * abrir. O tipo já vem escolhido — é a única coisa que a folha sabe e a lista
 * não.
 */

const abreFolha = async (page: import('@playwright/test').Page) => {
  await montarSupabaseFalso(page, {})
  await page.goto('/csc-vet/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /criar/i }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

const CASOS: [string, string][] = [
  ['Jogo', 'Jogo'],
  ['Treino', 'Treino'],
  ['Convívio', 'Convívio'],
]

for (const [opcao, tipoEsperado] of CASOS) {
  test(`o [+] abre o formulário de ${opcao.toLowerCase()} já no tipo certo`, async ({ page }) => {
    await abreFolha(page)
    await page.getByRole('button', { name: new RegExp(`^${opcao}`) }).click()

    // O formulário, e não a lista: o botão de guardar é o que só lá existe.
    await expect(page.getByRole('button', { name: /Criar Evento|Guardar/i }).first())
      .toBeVisible({ timeout: 15000 })

    // E com o tipo escolhido na folha já marcado.
    await expect(page.getByRole('button', { name: tipoEsperado, exact: true }))
      .toHaveClass(/ring-2|scale-/)

    /* O `?criar=` sai do endereço: recarregar não volta a atirar ninguém para
       dentro de um formulário. */
    await expect(page).not.toHaveURL(/criar=/)
  })
}

/**
 * Guardar um evento leva ao passo 2, a convocatória — e é um ecrã.
 *
 * Era uma persiana por cima da lista. É uma tarefa (escolher de vinte e tal
 * atletas e escrever em `callups`), por isso passou a ecrã a 2026-09-25:
 * título, "‹ Eventos" para o "Agora não", e as ações presas ao fundo.
 */
test('guardar um convívio leva ao ecrã de convocar', async ({ page }) => {
  await montarSupabaseFalso(page, { fields: [{ id: 'f1', name: 'Estádio Municipal', address: 'Cascais' }] })
  await page.goto('/csc-vet/events?criar=gathering')

  const dia = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10)
  await page.getByPlaceholder(/Jantar de Natal/).fill('Jantar da equipa')
  await page.locator('input[type="date"]').first().fill(dia)
  await page.locator('input[type="time"]').first().fill('20:00')
  // O campo é obrigatório.
  await page.locator('select').filter({ hasText: 'Estádio Municipal' }).first().selectOption('f1')
  await page.getByRole('button', { name: 'Guardar e convocar' }).click()

  const titulo = page.getByRole('heading', { level: 1, name: 'Falta convocar' })
  await expect(titulo).toBeVisible({ timeout: 15000 })
  await expect(titulo).toBeFocused()
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Guardar sem convocar|Convocar \d+/ })).toBeVisible()

  // O "‹ Eventos" é o "Agora não": o evento fica criado, e volta-se à lista.
  await page.getByRole('button', { name: 'Eventos', exact: true }).click()
  await expect(titulo).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Novo Evento' })).toBeVisible()
})
