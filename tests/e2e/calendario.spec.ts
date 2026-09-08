import { test, expect } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * Os controlos do mês, na Agenda.
 *
 * Estavam no cabeçalho do ecrã, longe do calendário que mudam e encostados ao
 * funil dos filtros, que não tem nada a ver com eles. Passam para dentro do
 * cartão do calendário, com o "Hoje" pelo meio — e o mês passa também com o
 * dedo, que é o gesto que se tenta primeiro num telemóvel.
 */

async function abreAgenda(page: import('@playwright/test').Page) {
  await montarSupabaseFalso(page, {})
  await page.goto('/csc-vet/calendar')
  await page.waitForLoadState('networkidle')
  await expect(page.getByLabel('Mês', { exact: true })).toBeVisible()
}

/** Um arrasto lateral sobre o cartão do calendário. */
async function arrasta(page: import('@playwright/test').Page, direcao: 'esquerda' | 'direita') {
  const caixa = await page.locator('.cartao-vidro').first().boundingBox()
  if (!caixa) throw new Error('o cartão do calendário não tem caixa')
  const y = caixa.y + caixa.height * 0.7
  const de = direcao === 'esquerda' ? caixa.x + caixa.width - 30 : caixa.x + 30
  const para = direcao === 'esquerda' ? caixa.x + 30 : caixa.x + caixa.width - 30

  await page.evaluate(([x1, x2, yy]) => {
    const el = document.querySelector('.cartao-vidro') as HTMLElement
    const toque = (tipo: string, x: number) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: yy })
      el.dispatchEvent(new TouchEvent(tipo, {
        bubbles: true,
        cancelable: true,
        touches: tipo === 'touchend' ? [] : [t],
        changedTouches: [t],
      }))
    }
    toque('touchstart', x1)
    toque('touchmove', x2)
    toque('touchend', x2)
  }, [de, para, y] as [number, number, number])
}

/** Um arrasto vertical, que é o gesto de rolar a página. */
async function rola(page: import('@playwright/test').Page) {
  const caixa = await page.locator('.cartao-vidro').first().boundingBox()
  if (!caixa) throw new Error('o cartão do calendário não tem caixa')
  const x = caixa.x + caixa.width / 2

  await page.evaluate(([xx, y1, y2]) => {
    const el = document.querySelector('.cartao-vidro') as HTMLElement
    const toque = (tipo: string, y: number) => {
      const t = new Touch({ identifier: 1, target: el, clientX: xx, clientY: y })
      el.dispatchEvent(new TouchEvent(tipo, {
        bubbles: true,
        cancelable: true,
        touches: tipo === 'touchend' ? [] : [t],
        changedTouches: [t],
      }))
    }
    toque('touchstart', y1)
    toque('touchmove', y2)
    toque('touchend', y2)
  }, [x, caixa.y + caixa.height - 20, caixa.y + 20] as [number, number, number])
}

test('as setas do mês estão no calendário, e não no cabeçalho', async ({ page }) => {
  await abreAgenda(page)

  const anterior = page.getByRole('button', { name: 'Mês anterior' })
  const seguinte = page.getByRole('button', { name: 'Mês seguinte' })
  await expect(anterior).toBeVisible()
  await expect(seguinte).toBeVisible()

  // Dentro do cartão do calendário — o mesmo que tem o seletor de mês.
  const cartao = page.locator('.cartao-vidro').first()
  await expect(cartao.getByRole('button', { name: 'Mês anterior' })).toBeVisible()
  await expect(cartao.getByRole('button', { name: 'Mês seguinte' })).toBeVisible()
  await expect(cartao.getByRole('button', { name: 'Hoje' })).toBeVisible()
})

test('arrastar para a esquerda avança o mês, e para a direita recua', async ({ page }) => {
  await abreAgenda(page)
  const seletor = page.getByLabel('Mês', { exact: true })
  const inicial = Number(await seletor.inputValue())

  await arrasta(page, 'esquerda')
  await expect(seletor).toHaveValue(String((inicial + 1) % 12))

  await arrasta(page, 'direita')
  await expect(seletor).toHaveValue(String(inicial))
})

test('rolar a página não muda o mês', async ({ page }) => {
  await abreAgenda(page)
  const seletor = page.getByLabel('Mês', { exact: true })
  const inicial = await seletor.inputValue()

  await rola(page)
  await page.waitForTimeout(200)
  await expect(seletor).toHaveValue(inicial)
})
