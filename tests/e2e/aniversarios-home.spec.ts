import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, FIXTURES_BASE } from './supabase-mock'

/**
 * "Aniversários deste mês" na Home: uma fila de fotografias, não uma frase.
 *
 * Era uma linha de texto apagada — "Nuno a 12 · Paulo faz anos hoje" — do
 * mesmo tamanho de uma nota de rodapé, ao lado de blocos como "Último jogo"
 * que têm o seu próprio título de secção. Passou a seguir a forma dos outros
 * blocos da Home (`<EtiquetaSeccao>` + `<CartaoSimples>`), com uma fotografia
 * por pessoa — o aro dourado marca quem faz anos hoje, como o "faz anos hoje"
 * do texto antigo, mas agora é o primeiro sinal que se vê.
 */

const ANIVERSARIANTES = [
  { id: 'p1', name: 'Nuno Aleixo', nickname: null, shirt_name: 'Nuno', jersey_number: 7, photo_url: null, status: 'active', birth_date: '1988-09-20' },
  { id: 'p2', name: 'Paulo Ferreira', nickname: null, shirt_name: 'Paulo', jersey_number: 10, photo_url: 'https://exemplo.local/paulo.jpg', status: 'active', birth_date: '1990-09-25' },
  // Do mês, mas inativo: um sócio que saiu não continua a aparecer aqui.
  { id: 'p3', name: 'Zé Antigo', nickname: null, shirt_name: 'Zé', jersey_number: 3, photo_url: null, status: 'inactive', birth_date: '1980-09-22' },
  // Aniversário de outro mês: não entra na lista de setembro.
  { id: 'p4', name: 'Rui Nunes', nickname: null, shirt_name: 'Rui', jersey_number: 5, photo_url: null, status: 'active', birth_date: '1991-10-03' },
]

test('mostra uma fotografia por pessoa, com o aro dourado em quem faz anos hoje', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-20T10:00:00'))
  await montarSupabaseFalso(page, {
    v_players_public: [...FIXTURES_BASE.v_players_public, ...ANIVERSARIANTES],
  })
  await page.goto('/csc-vet/')

  const seccao = page.locator('section', { hasText: 'Aniversários deste mês' })
  await expect(seccao).toBeVisible()

  // Só os dois de setembro que continuam ativos — nem o inativo, nem o de outubro.
  await expect(seccao.getByText('Nuno')).toBeVisible()
  await expect(seccao.getByText('Paulo')).toBeVisible()
  await expect(seccao.getByText('Zé')).toHaveCount(0)
  await expect(seccao.getByText('Rui')).toHaveCount(0)

  // Quem faz anos hoje (Nuno, dia 20): "Hoje" em vez do dia da semana.
  const cartaoNuno = seccao.locator('div', { hasText: 'Nuno' }).last()
  await expect(cartaoNuno.getByText('Hoje')).toBeVisible()

  // Os outros dias da semana, não "Hoje".
  const cartaoPaulo = seccao.locator('div', { hasText: 'Paulo' }).last()
  await expect(cartaoPaulo.getByText('Hoje')).toHaveCount(0)

  // Com fotografia é uma imagem; sem ela, a inicial do nome.
  await expect(cartaoPaulo.locator('img')).toHaveCount(1)
  await expect(cartaoNuno.getByText('N', { exact: true })).toBeVisible()
})

test('sem ninguém a fazer anos este mês, a secção não aparece', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-20T10:00:00'))
  await montarSupabaseFalso(page, {
    v_players_public: [...FIXTURES_BASE.v_players_public, ANIVERSARIANTES[3]],
  })
  await page.goto('/csc-vet/')

  await expect(page.getByText('Aniversários deste mês')).toHaveCount(0)
})
