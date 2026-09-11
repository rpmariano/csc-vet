import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * O convite para ligar os avisos.
 *
 * Existe porque `avisos_pendentes()` faz `COALESCE(flag, false)`: quem nunca
 * abriu o ecrã dos avisos não tem linha em `notification_preferences` e não
 * recebe nada. Era a explicação mais provável para 1191 convocatórias sem
 * resposta — ninguém estava a ser perguntado.
 *
 * O que este teste protege é a decisão, não o aspeto: o convite aparece a quem
 * nunca escolheu, **não** aparece a quem já escolheu, diz em letra visível os
 * três avisos que liga, e o "Agora não" tira-o do caminho.
 */

const perfil = {
  id: UTILIZADOR_TESTE.id,
  name: 'Utilizador de Teste',
  email: UTILIZADOR_TESTE.email,
  role: 'player',
  status: 'active',
  jersey_number: 9,
  shirt_name: 'Teste',
  position: 'Ponta de Lança',
  roles: ['player'],
}

const FAIXA = 'Não estás a receber avisos'
const TITULO = 'Avisamos-te quando fores convocado?'

test('a faixa aparece a quem nunca escolheu, e abre a persiana', async ({ page }) => {
  await montarSupabaseFalso(page, { profiles: [perfil], v_players_public: [perfil] })
  await page.goto('/csc-vet/')

  const faixa = page.getByRole('button', { name: new RegExp(FAIXA) })
  await expect(faixa).toBeVisible()
  await faixa.click()

  const persiana = page.getByRole('dialog')
  await expect(persiana).toBeVisible()
  await expect(persiana.getByText(TITULO)).toBeVisible()

  /* Os três avisos que o "sim" liga têm de estar escritos antes de haver
     botão nenhum para carregar: ligar mais do que a pergunta promete seria
     ganhar a resposta com letra pequena. */
  await expect(persiana.getByText('Convocatórias', { exact: true })).toBeVisible()
  await expect(persiana.getByText('Comunicados', { exact: true })).toBeVisible()
  await expect(persiana.getByText('Quotas', { exact: true })).toBeVisible()
})

test('"Agora não" fecha o convite e tira a faixa do caminho', async ({ page }) => {
  await montarSupabaseFalso(page, { profiles: [perfil], v_players_public: [perfil] })
  await page.goto('/csc-vet/')

  await page.getByRole('button', { name: new RegExp(FAIXA) }).click()
  await page.getByRole('button', { name: 'Agora não' }).click()

  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('button', { name: new RegExp(FAIXA) })).toBeHidden()
})

test('quem já escolheu não volta a ser convidado', async ({ page }) => {
  await montarSupabaseFalso(page, {
    profiles: [perfil],
    v_players_public: [perfil],
    notification_preferences: [{ profile_id: perfil.id, convocatorias: true }],
  })
  await page.goto('/csc-vet/')

  /* Esperar por alguma coisa da Home antes de afirmar a ausência: sem isso o
     teste passava por a página ainda estar vazia. */
  await expect(page.getByText('Sem jogos marcados')).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(FAIXA) })).toBeHidden()
})
