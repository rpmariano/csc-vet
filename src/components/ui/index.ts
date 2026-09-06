/**
 * Primitivos da linguagem visual do redesenho de 2026.
 *
 * Importar daqui — `import { CartaoVidro, Botao } from '../components/ui'` —
 * e não de cada ficheiro: o que está exposto aqui é a superfície pública, e o
 * que estiver dentro pode ser reorganizado sem tocar nos ecrãs.
 */

export { CartaoVidro, CartaoSimples } from './Cartoes'
export { FaixaTopo } from './FaixaTopo'
export { FilaSeparadores } from './FilaSeparadores'
export { Botao, Pastilha } from './Botoes'
export { TituloEcra, EtiquetaSeccao, NumeroGrande } from './Tipografia'

export type { FaixaTopoProps } from './FaixaTopo'
export type { FilaSeparadoresProps } from './FilaSeparadores'
export type { BotaoProps, PastilhaProps } from './Botoes'
