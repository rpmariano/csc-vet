import { test, expect, type Page, type Request } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * Os documentos dos atletas vivem num bucket privado (2026-09-26).
 *
 * Iam para o `club_assets`, que é público, e a app guardava o endereço
 * público: o cartão de cidadão de um atleta abria-se sem sessão. Hoje vão para
 * `documentos_atletas/<profile_id>/…`, a ficha guarda o caminho, e para abrir
 * pede-se um link temporário. Os antigos são copiados para lá da primeira vez
 * que a equipa técnica abre o Plantel.
 */

const ATLETA = {
  id: UTILIZADOR_TESTE.id,
  name: 'Utilizador de Teste', email: UTILIZADOR_TESTE.email,
  role: 'admin', roles: ['admin', 'player'], status: 'active',
  jersey_number: 99, shirt_name: 'Teste', position: 'Médio Centro',
  id_document_url: null as string | null, insurance_doc_url: null as string | null, medical_exam_doc_url: null as string | null,
}

const PUBLICO = 'https://teste.supabase.co/storage/v1/object/public/club_assets/member_idDoc_1_abc.pdf'

const pedidos = (page: Page, filtro: (r: Request) => boolean) => {
  const lista: Request[] = []
  page.on('request', r => { if (filtro(r)) lista.push(r) })
  return lista
}

test('um documento no bucket privado abre por um link temporário', async ({ page }) => {
  const caminho = `${ATLETA.id}/cc-1.pdf`
  await montarSupabaseFalso(page, {
    profiles: [{ ...ATLETA, id_document_url: caminho }],
    v_players_public: [ATLETA],
  })
  await page.goto(`/csc-vet/team-management?atleta=${ATLETA.id}`)

  const link = page.getByRole('link', { name: /Doc\. Identificação/ })
  await expect(link).toBeVisible({ timeout: 15000 })
  // O link é o temporário, do caminho guardado — nunca um endereço público.
  await expect(link).toHaveAttribute('href', new RegExp(`/storage/v1/object/sign/documentos_atletas/${caminho}\\?token=`))
})

test('um documento antigo, ainda público, continua a abrir enquanto não passa', async ({ page }) => {
  await montarSupabaseFalso(page, {
    profiles: [{ ...ATLETA, role: 'player', roles: ['player'], id_document_url: PUBLICO }],
    v_players_public: [ATLETA],
  })
  await page.goto('/csc-vet/settings')
  await expect(page.getByRole('link', { name: /Ver Documento CC anexado/ })).toHaveAttribute('href', PUBLICO, { timeout: 15000 })
})

test('no Perfil, o documento carrega-se para a pasta do próprio, no bucket privado', async ({ page }) => {
  const envios = pedidos(page, r => r.url().includes('/storage/v1/object/') && r.method() === 'POST' && !r.url().includes('/sign/'))
  await montarSupabaseFalso(page, { profiles: [ATLETA], v_players_public: [ATLETA] })
  await page.goto('/csc-vet/settings')

  await page.getByLabel('Doc. Identificação (CC / Passaporte)').setInputFiles({
    name: 'cartao.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste'),
  })

  await expect.poll(() => envios.length).toBeGreaterThan(0)
  expect(envios[0].url()).toMatch(new RegExp(`/storage/v1/object/documentos_atletas/${ATLETA.id}/cc-\\d+\\.pdf$`))
  expect(envios.some(r => r.url().includes('club_assets'))).toBe(false)
  // E o link que aparece é o temporário.
  await expect(page.getByRole('link', { name: /Ver Documento CC anexado/ }))
    .toHaveAttribute('href', /\/object\/sign\/documentos_atletas\//)
})

test('a equipa técnica abre o Plantel e os documentos antigos passam para o bucket privado', async ({ page }) => {
  const envios = pedidos(page, r => r.url().includes('/storage/v1/object/documentos_atletas/') && r.method() === 'POST')
  const fichas = pedidos(page, r => r.url().includes('/rest/v1/profiles') && r.method() === 'PATCH')
  const apagados = pedidos(page, r => r.url().includes('/storage/v1/object/club_assets') && r.method() === 'DELETE')

  await montarSupabaseFalso(page, {
    profiles: [{ ...ATLETA, id_document_url: PUBLICO }],
    v_players_public: [ATLETA],
  })
  await page.goto('/csc-vet/team-management')

  // Copia para a pasta da ficha…
  await expect.poll(() => envios.length, { timeout: 15000 }).toBe(1)
  expect(envios[0].url()).toMatch(new RegExp(`/documentos_atletas/${ATLETA.id}/cc-\\d+\\.pdf$`))
  // …aponta a ficha para a cópia…
  await expect.poll(() => fichas.length).toBe(1)
  expect(JSON.parse(fichas[0].postData() ?? '{}').id_document_url).toMatch(new RegExp(`^${ATLETA.id}/cc-\\d+\\.pdf$`))
  // …e só então apaga o original do bucket público.
  await expect.poll(() => apagados.length).toBe(1)
  expect(apagados[0].postData() ?? '').toContain('member_idDoc_1_abc.pdf')
})
