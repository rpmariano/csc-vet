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
