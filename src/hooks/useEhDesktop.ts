import { useEffect, useState } from 'react'

/**
 * Verdadeiro na UI de desktop, falso na de telemóvel — o mesmo ponto de corte
 * (`md:`, 768px) que separa as duas UIs no Tailwind.
 *
 * Serve para decidir *estrutura*, não aparência: o que muda só de aspeto
 * resolve-se com classes `md:` no CSS, sem passar por aqui. Aqui está o que
 * tem de ser outro componente — uma persiana no telemóvel, uma página no
 * desktop.
 *
 * Reage a redimensionamentos e à rotação do ecrã.
 */

const CONSULTA = '(min-width: 768px)'

export function useEhDesktop(): boolean {
  const [ehDesktop, setEhDesktop] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(CONSULTA).matches,
  )

  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA)
    const aoMudar = (e: MediaQueryListEvent) => setEhDesktop(e.matches)

    consulta.addEventListener('change', aoMudar)
    return () => consulta.removeEventListener('change', aoMudar)
  }, [])

  return ehDesktop
}

export default useEhDesktop
