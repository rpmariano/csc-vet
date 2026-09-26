import { useCallback } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { haEntradaAnterior } from '../lib/rotas'

/**
 * O "‹" de uma ficha que vai no endereço (`?event=`, `?atleta=`, `?jogo=`…).
 *
 * **Faz o mesmo que o retroceder do browser.** Se a ficha foi aberta dentro
 * da app, volta uma entrada atrás — para a lista, ou para a Home, ou para a
 * Classificação, de onde quer que se tenha vindo. Havia duas maneiras de
 * fechar: umas fichas tiravam o parâmetro com `replace` e deixavam uma
 * entrada morta no histórico (o retroceder a seguir não fazia nada), as do
 * Clube tiravam-no com `push` e o retroceder a seguir **reabria** a ficha. E
 * nenhuma voltava à origem: o jogo aberto na Home dizia "‹ Agenda" e caía na
 * Agenda, com o retroceder do browser a levar à Home.
 *
 * **Aberta por um link de fora** (não há entrada anterior nesta visita), cai
 * na lista a que pertence: tira os parâmetros com `replace`.
 *
 * O texto do "‹" é o `origem` que quem abriu passou no `state`
 * (`nomeDoEcra`), e na falta dele o nome da lista.
 */
export const useVoltarDaFicha = (chaves: readonly string[], lista: string) => {
  const navegar = useNavigate()
  const { state } = useLocation()
  const [params, setParams] = useSearchParams()
  const origem = (state as { origem?: unknown } | null)?.origem

  /* Em texto, para a dependência não mudar a cada render: quem chama passa
     uma lista literal. */
  const juntas = chaves.join(',')

  const aoVoltar = useCallback(() => {
    const lista = juntas.split(',')
    if (!lista.some(c => params.has(c))) return
    if (haEntradaAnterior()) {
      navegar(-1)
      return
    }
    const restantes = new URLSearchParams(params)
    lista.forEach(c => restantes.delete(c))
    setParams(restantes, { replace: true })
  }, [juntas, params, navegar, setParams])

  return {
    voltarPara: typeof origem === 'string' && origem ? origem : lista,
    aoVoltar,
  }
}
