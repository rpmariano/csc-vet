import React from 'react'
import { AvatarPerfil } from './AvatarPerfil'
import { PastilhaEstado } from './PastilhaEstado'
import { TituloEcra } from './Tipografia'
import { AnnouncementsInboxButton } from '../AnnouncementsInbox'

/**
 * O cabeçalho de um ecrã: uma sobrancelha dourada, o nome do ecrã em grande e,
 * no canto, o estado clínico, o sino dos comunicados e a fotografia.
 *
 * No redesenho não há barra de topo, mas **o canto é o mesmo em todos os
 * ecrãs**: o estado ("Apto"), o sino e a fotografia que abre o Perfil. Estavam
 * só na Home, e nos outros ecrãs ficava a fotografia sozinha — um comunicado
 * novo não tinha por onde ser visto sem passar pela Home, e o estado clínico
 * só se lia lá. A Home tem o seu próprio cabeçalho (o clube e a época no lugar
 * do título), mas com o mesmo canto.
 *
 * A sobrancelha ("ÉPOCA 25/26", "GESTÃO") é opcional e serve para situar sem
 * gastar uma linha de texto corrido.
 */

export interface CabecalhoEcraProps {
  titulo: string
  /** Linha pequena e espaçada por cima do título. */
  sobrancelha?: string
  /** Linha discreta por baixo do título. */
  legenda?: string
  /** Ações à direita, antes da fotografia. */
  acoes?: React.ReactNode
  className?: string
}

export const CabecalhoEcra: React.FC<CabecalhoEcraProps> = ({
  titulo,
  sobrancelha,
  legenda,
  acoes,
  className = '',
}) => (
  <header className={`flex items-center gap-3 pt-safe ${className}`}>
    <div className="flex-1 min-w-0">
      {sobrancelha && (
        /* Numa linha só, e cortada se não couber: com o canto sempre a levar
           o estado, o sino e a fotografia, uma sobrancelha que quebrasse fazia
           o cabeçalho mudar de altura de ecrã para ecrã. */
        <p className="font-display font-extrabold text-[10px] tracking-[0.24em] text-csc-gold uppercase truncate">
          {sobrancelha}
        </p>
      )}
      <TituloEcra className={sobrancelha ? 'mt-2' : ''}>{titulo}</TituloEcra>
      {legenda && <p className="text-[11px] text-white/62 mt-1.5">{legenda}</p>}
    </div>

    {acoes}
    <PastilhaEstado />
    <AnnouncementsInboxButton tone="dark" size="md" />
    <AvatarPerfil tamanho={38} />
  </header>
)

export default CabecalhoEcra
