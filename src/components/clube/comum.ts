/**
 * O que as secções de gestão do Clube partilham.
 *
 * São quatro ecrãs irmãos — Dados do clube, Campos, Adversários e Torneios —
 * que vieram do `AdminDashboard`, a página que o handoff diz que não devia
 * existir: "tudo o que era gestão vive no ecrã Clube". Cada um trata dos seus
 * dados; o que é mesmo comum, o desenho dos campos de formulário e os tipos
 * das tabelas, fica aqui para não voltar a haver quatro cópias.
 */
import type { CampoDaFicha } from './FichaCampo'
import type { AdversarioDaFicha } from './FichaAdversario'

/** Campo branco de formulário, o mesmo desenho do resto da app. */
export { CLASSE_CAMPO as CAMPO } from '../ui/formulario'

/** Etiqueta pequena, em maiúsculas, por cima do campo. */
export { CLASSE_ETIQUETA_CAMPO as ETIQUETA } from '../ui/formulario'

/** Linha de `fields`. É a mesma forma que a ficha do campo (9i) recebe. */
export type Campo = CampoDaFicha

/** Linha de `opponents`. É a mesma forma que a ficha do adversário (9h) recebe. */
export type Adversario = AdversarioDaFicha

/** Pesquisa no Google Maps por texto livre — nome e morada de um campo. */
export const urlDoGoogleMaps = (procura: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(procura)}`
