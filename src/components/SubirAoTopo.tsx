import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Um ecrã abre sempre no topo.
 *
 * Numa app de página única o browser não repõe o scroll: quem estava no fim da
 * Agenda e tocava no Plantel caía a meio da lista de atletas, sem cabeçalho e
 * sem perceber onde estava. Isto põe a janela no topo a cada mudança de ecrã.
 *
 * **O que conta como mudar de ecrã** é o caminho e o `?ver=`, que é como as
 * secções do Clube e os separadores da Competição e do Financeiro se
 * identificam: são conteúdo novo, e começam do princípio.
 *
 * **O que não conta são as fichas** — `?event=`, `?atleta=`, `?jogo=`,
 * `?campo=`, `?adversario=`, `?convocatoria=`, e as persianas como `?conta=`.
 * As fichas são ecrãs e abrem no topo, mas quem trata disso é a
 * `<AreaDoEcra>` (`EcraDetalhe.tsx`), que também devolve a lista ao sítio onde
 * estava quando se volta; as persianas abrem por cima e não mexem no scroll.
 *
 * Em `useLayoutEffect` e não em `useEffect`: o navegador pinta entre o render e
 * o efeito, e com o efeito normal via-se o ecrã novo a meio antes de saltar.
 */
export const SubirAoTopo: React.FC = () => {
  const { pathname, search } = useLocation()
  const seccao = new URLSearchParams(search).get('ver')

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname, seccao])

  return null
}

export default SubirAoTopo
