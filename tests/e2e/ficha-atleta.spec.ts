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
  emergency_contact_name: 'Maria (esposa)', emergency_contact_phone: '939999999',
  id_document_url: null, insurance_doc_url: null, medical_exam_doc_url: null,
}

async function abreFicha(page: import('@playwright/test').Page, perfil = PERFIL) {
  await montarSupabaseFalso(page, {
    profiles: [perfil],
    v_players_public: [perfil],
    quota_exemptions: [{ profile_id: perfil.id, month_year: '0000-12', reason: null }],
  })
  await page.goto(`/csc-vet/team-management?atleta=${perfil.id}`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('dialog')).toBeVisible()
}

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
