/**
 * A app que ficou para trás de um deploy.
 *
 * Cada página é um `React.lazy` que aponta para um ficheiro com o hash da
 * versão (`Home-NPWcopVw.js`). Um push para a `main` substitui a pasta inteira
 * no GitHub Pages e o hash muda — e quem tinha a app aberta desde antes, num
 * separador ou instalada, continua a correr o `App` antigo, que pede o hash
 * antigo. O pedido dá 404 ("Failed to fetch dynamically imported module") e,
 * sem nada a apanhá-lo, o React Router mostrava a sua página de erro, em
 * inglês e com um aceno ao programador.
 *
 * O service worker agravava-o: com `autoUpdate` e `cleanupOutdatedCaches`, o
 * SW novo toma o controlo assim que instala e apaga a cache antiga enquanto a
 * página antiga ainda está a correr — mesmo o pedaço que estava guardado
 * desaparece. Por isso "por vezes": só acontecia a quem atravessava um deploy
 * com a app aberta, e há vários por dia.
 *
 * A resposta é sempre a mesma — recarregar, que vai buscar o `index.html`
 * novo com os hashes certos — em três momentos:
 *
 * 1. `vite:preloadError`, que o Vite dispara quando um `import()` dinâmico
 *    falha. Recarrega antes de o erro chegar ao React.
 * 2. O `errorElement` das rotas (`EcraDeErro`, em `App.tsx`), para o que
 *    escape ao evento — e para mostrar um ecrã da app quando recarregar não
 *    resolveu.
 * 3. `controllerchange` do service worker: quando o SW novo toma o controlo,
 *    a página que está aberta é a antiga e vai falhar à próxima navegação.
 *    Recarrega-se já — **a não ser que haja um formulário por gravar**, e aí
 *    espera-se que grave ou descarte, porque um `reload` a meio do Perfil
 *    deitava fora o que se escreveu.
 *
 * **Recarrega-se uma vez só.** Se o ficheiro não existe mesmo — um deploy
 * partido, um caminho errado — recarregar em ciclo é um ecrã a piscar para
 * sempre; a segunda falha em poucos segundos deixa o erro passar para o
 * `EcraDeErro`, que tem o botão de recarregar à mão.
 */

const CHAVE_RECARGA = 'csc_recarga_por_versao'
/** Duas falhas dentro deste intervalo é um ficheiro que não existe, não uma versão velha. */
const JANELA_DE_RECARGA_MS = 15_000

const PADROES_DE_PEDACO_EM_FALTA = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
]

/** Se o erro é um pedaço de código que já não existe no servidor. */
export function ePedacoEmFalta(erro: unknown): boolean {
  const mensagem =
    erro instanceof Error ? erro.message : typeof erro === 'string' ? erro : ''
  return PADROES_DE_PEDACO_EM_FALTA.some(p => p.test(mensagem))
}

function lerUltimaRecarga(): number {
  try {
    return Number(sessionStorage.getItem(CHAVE_RECARGA) ?? 0)
  } catch {
    return 0
  }
}

/**
 * Recarrega a página, a não ser que já se tenha recarregado há instantes —
 * nesse caso devolve `false` e quem chamou mostra o erro.
 */
export function recarregarUmaVez(): boolean {
  if (Date.now() - lerUltimaRecarga() < JANELA_DE_RECARGA_MS) return false
  try {
    sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()))
  } catch {
    /* Sem sessionStorage (modo privado antigo) recarrega-se na mesma; o pior
       caso é um segundo reload. */
  }
  window.location.reload()
  return true
}

/* ---- O que está por gravar, para não se recarregar por cima ---------------- */

let haTrabalhoPorGravar = false
let recargaAdiada = false

/**
 * O `SaidaGuardadaProvider` diz-nos, a cada registo, se há um formulário com
 * alterações. Quando deixa de haver e uma recarga ficou à espera, é agora.
 */
export function informarTrabalhoPorGravar(sujo: boolean) {
  haTrabalhoPorGravar = sujo
  if (!sujo && recargaAdiada) {
    recargaAdiada = false
    window.location.reload()
  }
}

/* ---- Os dois ouvintes, ligados uma vez no arranque ------------------------ */

let ligado = false

export function vigiarVersaoDaApp() {
  if (ligado || typeof window === 'undefined') return
  ligado = true

  window.addEventListener('vite:preloadError', evento => {
    // Recarregada, a página nova traz os hashes certos. Se já se recarregou há
    // pouco, deixa-se o erro seguir para o `EcraDeErro`.
    if (recarregarUmaVez()) evento.preventDefault()
  })

  if (!('serviceWorker' in navigator)) return
  /*
    Na primeira visita não há controlador: o SW instala, reclama a página e
    dispara `controllerchange` — e essa não é uma versão nova, é a primeira.
    Só a partir do segundo controlador é que a troca significa um deploy.
  */
  let tinhaControlador = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControlador) {
      tinhaControlador = true
      return
    }
    if (haTrabalhoPorGravar) {
      recargaAdiada = true
      return
    }
    window.location.reload()
  })
}
