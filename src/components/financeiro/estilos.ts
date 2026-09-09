/**
 * As três cores em que a app fala de dinheiro, e o euro em português.
 *
 * Vermelho em atraso, âmbar a vencer, verde pago — e uma barra de 3px à
 * esquerda da linha a dizer o mesmo sem se ler nada. Estavam no topo de
 * `FinancePage.tsx`; saíram para aqui quando a Visão Geral passou a ficheiro
 * próprio, para continuarem a estar **num sítio só**. As Quotas e os Encargos
 * já disseram a mesma coisa de maneiras diferentes.
 */

/** A etiqueta dourada que anuncia um bloco do Financeiro. */
export const ETIQUETA_SECCAO =
  'font-display font-extrabold text-[9.5px] tracking-[0.14em] uppercase text-csc-gold'

/**
 * O cabeçalho de um grupo dentro de uma lista — maiúsculas pequenas e
 * espaçadas sobre uma banda mais clara. O que vem por baixo é conteúdo, e
 * escreve-se com peso: sem esta diferença a categoria "Seguro Desportivo"
 * aparece colada ao encargo "Seguro Desportivo 26/27" sem nada a dizer que um
 * é o título do outro.
 */
export const ETIQUETA_GRUPO =
  'font-display font-extrabold text-[9.5px] tracking-[0.16em] uppercase text-white/70'

const CHIP =
  'shrink-0 font-display font-black text-[8.5px] tracking-[0.1em] uppercase ' +
  'px-2 py-1 rounded-full border whitespace-nowrap'
export const CHIP_ATRASO = `${CHIP} bg-csc-red/15 border-csc-red/35 text-csc-vermelho-texto`
export const CHIP_AVISO = `${CHIP} bg-amber-500/15 border-amber-400/35 text-amber-300`
export const CHIP_PAGO = `${CHIP} bg-csc-light/15 border-csc-light/30 text-csc-verde-texto`
export const CHIP_NEUTRO = `${CHIP} bg-white/6 border-white/12 text-white/62`

/** A barra de cor à esquerda de uma linha — diz o estado sem se ler nada. */
export const BARRA_ATRASO = 'bg-csc-red'
export const BARRA_AVISO = 'bg-amber-400'
export const BARRA_PAGO = 'bg-csc-light/60'
export const BARRA_NEUTRA = 'bg-white/15'

/**
 * Euros em português: vírgula decimal, espaço fino antes do símbolo e ponto
 * nos milhares. Era `n.toFixed(2) + '€'`, que dava "1019.00€" — a notação
 * inglesa, num ecrã onde tudo o resto está em português.
 */
const EUROS = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
export const fmtEuro = (n: number) => EUROS.format(n)

/**
 * O mesmo valor sem cêntimos, para caber num eixo ou numa etiqueta de gráfico.
 * Num gráfico a casa decimal não decide nada e rouba a largura toda.
 */
const EUROS_REDONDOS = new Intl.NumberFormat('pt-PT', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})
export const fmtEuroCurto = (n: number) => EUROS_REDONDOS.format(n)

/** 'Set', 'Out', … — o mês em três letras, para os eixos dos gráficos. */
export const MESES_CURTOS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

/** 'DD/MM/AAAA' a partir de uma data ISO, sem passar por `new Date()`. */
export const fmtData = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
