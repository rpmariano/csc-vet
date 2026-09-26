import React, { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useClub } from '../../context/ClubContext'
import { useEpocaAtual } from '../../hooks/useEpocaAtual'
import { formatClubSigla } from '../../lib/siglas'
import { useFichaPorLigar } from '../FichaPorLigar'
import { AvatarPerfil, PastilhaEstado } from '../ui'
import { AnnouncementsInboxButton } from '../AnnouncementsInbox'
import { SinalPagamentos } from '../SinalPagamentos'

/**
 * O cabeçalho da app: o clube e a época à esquerda, e no canto o sinal de
 * pagamentos, o estado clínico, o sino dos comunicados e a fotografia.
 *
 * **Um só, na moldura, e igual em todos os ecrãs.** Até 2026-09-25 era da
 * Home; os outros ecrãs tinham uma linha de canto dentro do seu próprio
 * cabeçalho, à direita da sobrancelha. Eram o mesmo canto desenhado em dois
 * sítios, e o clube só se via na Home. Hoje o `<CabecalhoEcra>` de cada ecrã
 * fica com a sobrancelha e o título, e o que é de toda a app vive aqui.
 *
 * **Fica preso ao topo ao rolar**, como a barra de baixo fica presa ao fundo:
 * o canto é para onde se vai ver se há comunicados ou pagamentos, e não deve
 * ser preciso voltar ao princípio de uma lista comprida para lá chegar. Por
 * cima da faixa do topo é transparente, como sempre foi; quando o conteúdo
 * começa a passar por baixo, ganha fundo e uma linha, senão o texto que
 * rolasse por trás lia-se através dele. Tem ~62px — ocupa pouco ecrã de
 * propósito, porque fica lá sempre.
 *
 * O título de cada ecrã não sobe para aqui: rola com o conteúdo. A barra de
 * baixo já diz em que lugar se está, e um título que mudasse de sítio ao
 * rolar era mais uma coisa a mexer.
 */
export const CabecalhoApp: React.FC = () => {
  const { profile, assignedRoles } = useAuth()
  const { clubSettings } = useClub()
  const estadoDaFicha = useFichaPorLigar(profile, assignedRoles)
  // Sem ficha ligada não há estado clínico nem contas para mostrar.
  const semFicha = estadoDaFicha === 'por-ligar'

  const epoca = useEpocaAtual()

  const [rolado, setRolado] = useState(false)
  useEffect(() => {
    const medir = () => setRolado(window.scrollY > 4)
    medir()
    window.addEventListener('scroll', medir, { passive: true })
    return () => window.removeEventListener('scroll', medir)
  }, [])

  if (!profile) return null

  const emblema = clubSettings?.logo_url || '/csc-vet/cascais-emblem.png'
  const sigla = formatClubSigla(clubSettings?.initials)

  return (
    <header
      className={`sticky top-0 z-40 pt-safe transition-[background-color,border-color,box-shadow] duration-200 border-b ${
        rolado
          ? 'bg-csc-dark/92 backdrop-blur-md border-white/10 shadow-[0_6px_18px_rgba(0,0,0,0.28)]'
          : 'bg-transparent border-transparent'
      }`}
    >
      {/* 8px entre as peças do canto, e não 12: com o € no canto, a 390px o
          nome do clube cortava-se ("CSC Vetera…"). */}
      <div className="flex items-center gap-2 px-[18px] py-3">
        <img
          src={emblema}
          alt=""
          className="w-[38px] h-[38px] rounded-full bg-white object-contain p-[3px] flex-none mr-0.5"
        />
        <div className="flex-1 min-w-0">
          <p className="font-display font-extrabold text-[13.5px] text-white truncate">{sigla} Veteranos</p>
          <p className="text-[10.5px] text-white/60 truncate mt-px">Época {epoca}</p>
        </div>
        {!semFicha && <SinalPagamentos />}
        {!semFicha && <PastilhaEstado />}
        <AnnouncementsInboxButton tone="dark" size="md" />
        <AvatarPerfil tamanho={38} />
      </div>
    </header>
  )
}

export default CabecalhoApp
