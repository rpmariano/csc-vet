import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * O aviso de alterações por gravar, no caminho mais difícil: o retroceder do
 * browser.
 *
 * Um diálogo sabe quando lhe pedem para fechar; um formulário que ocupa a
 * página não — sai-se dele a navegar. O `SaidaGuardadaProvider` usa o
 * `useBlocker` do React Router para o apanhar, e foi para o ter que as rotas
 * passaram a um data router. Sem este teste, uma volta ao `<BrowserRouter>`
 * levava o guarda pela frente sem nada dar por isso.
 */

const dialogos = (pagina: import('@playwright/test').Page) =>
  pagina.locator('[role="dialog"]')

const perfil = {
  id: UTILIZADOR_TESTE.id,
  name: 'Utilizador de Teste',
  email: UTILIZADOR_TESTE.email,
  role: 'admin',
  status: 'active',
  jersey_number: 99,
  shirt_name: 'Teste',
  position: 'Médio Centro',
  roles: ['admin', 'player'],
}

/*
  A ida ao Perfil é **dentro da app**, pela fotografia do cabeçalho, e não por
  um `goto`. Dois `goto` seguidos são dois documentos, e retroceder entre eles é
  navegação do browser: aí o React Router não tem como bloquear nada, e quem
  pergunta é o `beforeunload`. O que este teste cobre é o retroceder dentro da
  app, que é o caso normal de quem a usa.
*/
async function abreOPerfilComAlteracoes(pagina: import('@playwright/test').Page) {
  await montarSupabaseFalso(pagina, { profiles: [perfil], v_players_public: [perfil] })

  await pagina.goto('/csc-vet/calendar')
  await pagina.getByRole('link', { name: 'Ver o meu perfil' }).click()
  await expect(pagina).toHaveURL(/settings$/)

  const nome = pagina.getByPlaceholder('Ex: André Gomes Marques do Couto')
  await expect(nome).toBeVisible()
  await nome.fill('Outro Nome Qualquer')
  return nome
}

test('o retroceder do browser pergunta antes de deitar fora o formulário', async ({ page }) => {
  await abreOPerfilComAlteracoes(page)

  await page.goBack()

  // Continua no Perfil, com o aviso por cima.
  await expect(dialogos(page)).toHaveCount(1)
  await expect(dialogos(page).first()).toContainText('perfil')
  await expect(page).toHaveURL(/settings$/)
})

test('cancelar o aviso deixa ficar o que estava escrito', async ({ page }) => {
  const nome = await abreOPerfilComAlteracoes(page)

  await page.goBack()
  await dialogos(page).first().getByRole('button', { name: /Continuar a Editar/ }).click()

  await expect(dialogos(page)).toHaveCount(0)
  await expect(page).toHaveURL(/settings$/)
  await expect(nome).toHaveValue('Outro Nome Qualquer')
})

test('sair sem gravar deixa mesmo sair', async ({ page }) => {
  await abreOPerfilComAlteracoes(page)

  await page.goBack()
  await dialogos(page).first().getByRole('button', { name: 'Sair sem Gravar' }).click()

  await expect(page).toHaveURL(/calendar$/)
  await expect(dialogos(page)).toHaveCount(0)
})

test('sem alterações, o retroceder não pergunta nada', async ({ page }) => {
  await montarSupabaseFalso(page, { profiles: [perfil], v_players_public: [perfil] })
  await page.goto('/csc-vet/calendar')
  await page.getByRole('link', { name: 'Ver o meu perfil' }).click()
  await expect(page.getByPlaceholder('Ex: André Gomes Marques do Couto')).toBeVisible()

  await page.goBack()

  await expect(page).toHaveURL(/calendar$/)
  await expect(dialogos(page)).toHaveCount(0)
})
