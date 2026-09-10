import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * A ficha do atleta mostra tudo o que a base tem — ver não é editar.
 *
 * Faltavam-lhe o email e o telemóvel (estavam só dentro do formulário de
 * edição, e é esta a página de quem precisa de ligar a alguém antes de um
 * jogo), o tamanho de equipamento, o pé preferido, a janela de quota e os
 * meses dispensados. E o crachá do RGPD dizia "RGPD Consentido" a toda a
 * gente: não lia `gdpr_consent`.
 *
 * A **edição** continua onde estava — no formulário, e só de treinador ou
 * direção.
 */

const PERFIL = {
  id: UTILIZADOR_TESTE.id,
  name: 'Utilizador de Teste', email: UTILIZADOR_TESTE.email,
  role: 'admin', roles: ['admin', 'player'], status: 'active',
  jersey_number: 99, shirt_name: 'Teste', nickname: null, position: 'Médio Centro',
  medical_notes: 'Alergia a penicilina', photo_url: null, phone: '912345678',
  birth_date: '1980-04-12', nationality: 'Portuguesa', nif: '123456789',
  id_number: '12345678 9 ZZ1', id_card_expiry: '2030-01-01', member_number: '1420',
  address: 'R. da Torre 12', postal_code: '2750-748', city: 'Cascais',
  iban: 'PT50000000000000000000', kit_size: 'M', preferred_foot: 'Esquerdo',
  gdpr_consent: false, quota_start_date: '2026-09-01', quota_end_date: null,
  emergency_contact_name: 'Maria Silva', emergency_contact_phone: '939999999',
  emergency_contact_relation: null as string | null,
  id_document_url: null, insurance_doc_url: null, medical_exam_doc_url: null,
}

async function abreFicha(page: import('@playwright/test').Page, perfil = PERFIL) {
  await montarSupabaseFalso(page, {
    profiles: [perfil],
    v_players_public: [perfil],
    quota_exemptions: [{ profile_id: perfil.id, month_year: '0000-12', reason: null }],
  })
  await page.goto(`/csc-vet/team-management?atleta=${perfil.id}`)
  await expect(page.getByRole('dialog')).toBeVisible()
}

/*
  O cartão de identidade é centrado, e tem de o ser em relação ao cartão
  inteiro. Tinha um `pr-12` a dar lugar ao botão de fechar, que flutua por
  cima do canto — e uma margem só de um lado, num cartão centrado, empurra
  tudo para a esquerda do centro real. Não se vê num diff, e a olho parece
  só "estranho".
*/
test('a fotografia e o nome ficam no centro do cartão', async ({ page }) => {
  await abreFicha(page)

  const medida = await page.evaluate(() => {
    const cartao = document.querySelector('[role="dialog"] .cartao-vidro') as HTMLElement | null
    const titulo = cartao?.querySelector('h2') as HTMLElement | null
    if (!cartao || !titulo) return null
    const c = cartao.getBoundingClientRect()
    const t = titulo.getBoundingClientRect()
    return Math.abs((c.left + c.width / 2) - (t.left + t.width / 2))
  })

  expect(medida, 'o cartão de identidade tem de existir').not.toBeNull()
  // Um pixel de folga chega para o arredondamento do layout.
  expect(medida!).toBeLessThanOrEqual(1)
})

test('os contactos estão na ficha, e não só na edição', async ({ page }) => {
  await abreFicha(page)
  const ficha = page.getByRole('dialog')

  await expect(ficha.getByText(UTILIZADOR_TESTE.email)).toBeVisible()
  await expect(ficha.getByText('912345678')).toBeVisible()
})

test('o que a equipa técnica atribui: camisola, tamanho e pé', async ({ page }) => {
  await abreFicha(page)
  const ficha = page.getByRole('dialog')

  await expect(ficha.getByText('#99')).toBeVisible()
  await expect(ficha.getByText('M', { exact: true })).toBeVisible()
  await expect(ficha.getByText('Esquerdo', { exact: true })).toBeVisible()
})

test('a janela de quota e os meses dispensados', async ({ page }) => {
  await abreFicha(page)
  const ficha = page.getByRole('dialog')

  await expect(ficha.getByText('01/09/2026')).toBeVisible()
  await expect(ficha.getByText('Sem fim marcado')).toBeVisible()
  await expect(ficha.getByText('Dez', { exact: true })).toBeVisible()
})

test('o RGPD diz o que está na base, e não "consentido" a toda a gente', async ({ page }) => {
  await abreFicha(page)
  await expect(page.getByRole('dialog').getByText('RGPD por consentir')).toBeVisible()

  await abreFicha(page, { ...PERFIL, gdpr_consent: true })
  await expect(page.getByRole('dialog').getByText('RGPD consentido')).toBeVisible()
})

test('o campo tático da ficha não convida a clicar: é só de leitura', async ({ page }) => {
  await abreFicha(page)
  await expect(page.getByRole('dialog').getByText('Clica no campo para alternar')).toHaveCount(0)
})

/**
 * A relação com o contacto de emergência é uma lista, não texto livre.
 *
 * Vivia dentro do nome — "Maria (esposa)", "Maria - esposa" ou só "Maria",
 * conforme o dia. Num acidente, quem lê a ficha precisa de saber de imediato
 * quem é a pessoa a quem vai ligar.
 */
test('a relação aparece na ficha, por baixo do nome', async ({ page }) => {
  await abreFicha(page, { ...PERFIL, emergency_contact_relation: 'Cônjuge' })

  const ficha = page.getByRole('dialog')
  // O nome e a relação em linhas próprias, e não "Maria (esposa)" num campo só.
  await expect(ficha.getByText('Maria Silva', { exact: true })).toBeVisible()
  await expect(ficha.getByText('Cônjuge', { exact: true })).toBeVisible()
})

/*
  Abrir o Perfil não espera por `networkidle` — espera pelo campo que se vai
  usar, que é o que interessa. O `networkidle` estourava o prazo do teste de
  vez em quando: é uma promessa sobre a rede inteira, e basta um pedido que
  fique pendurado (uma fotografia, um tipo de letra) para nunca chegar.
  Playwright desaconselha-o por isto mesmo.
*/
test('no Perfil, a relação escolhe-se numa lista fechada', async ({ page }) => {
  await abreFicha(page)
  await page.goto('/csc-vet/settings')

  const relacao = page.getByLabel('Relação', { exact: true })
  await expect(relacao).toBeVisible()
  await relacao.selectOption('Irmão/ã')
  await expect(relacao).toHaveValue('Irmão/ã')
})

/**
 * A janela de atividade deixou de estar vazia.
 *
 * Quem já cá estava ficou com 02/09/2026, o primeiro dia da época. Daí para a
 * frente é o gatilho `profiles_janela_de_atividade` que a escreve, a partir do
 * estado — verificado contra a base, que é onde a regra vive.
 */
test('a janela de atividade aparece no Perfil, só de leitura', async ({ page }) => {
  await abreFicha(page)
  await page.goto('/csc-vet/settings')

  await expect(page.getByText('01/09/2026')).toBeVisible()
  await expect(page.getByText('Sem fim marcado')).toBeVisible()
})

/** O lugar do meio do campo chama-se "Médio Centro" em toda a app. */
test('o meio-campo diz "Médio Centro", e não "Médio Defensivo"', async ({ page }) => {
  await abreFicha(page)
  const ficha = page.getByRole('dialog')

  await expect(ficha.getByText(/Médio Defensivo/)).toHaveCount(0)
  await expect(ficha.getByText('Médio Centro').first()).toBeVisible()
})

/**
 * O tamanho de equipamento e o pé preferido são do próprio.
 *
 * Estavam no bloco travado do Perfil, junto com as posições, as funções e o
 * número de camisola: para mudar de tamanho era preciso pedir a alguém da
 * direção. A RLS sempre deixou — a política de UPDATE da própria ficha só
 * guarda `role` e `roles`.
 */
test('o atleta muda o tamanho e o pé no seu Perfil', async ({ page }) => {
  await abreFicha(page)
  await page.goto('/csc-vet/settings')

  const tamanho = page.getByLabel('Tamanho de Equipamento', { exact: true })
  await expect(tamanho).toBeEnabled()
  await tamanho.selectOption('XL')
  await expect(tamanho).toHaveValue('XL')

  const pe = page.getByLabel('Pé preferido', { exact: true })
  await expect(pe).toBeEnabled()
  await pe.selectOption('Ambos')
  await expect(pe).toHaveValue('Ambos')
})

test('a camisola e as posições continuam travadas no Perfil', async ({ page }) => {
  await abreFicha(page)
  await page.goto('/csc-vet/settings')

  // O número é texto, não campo: quem o atribui é a equipa técnica.
  await expect(page.getByText('#99', { exact: true })).toBeVisible()
  await expect(page.getByLabel(/Nº da Camisola/)).toHaveCount(0)
})
