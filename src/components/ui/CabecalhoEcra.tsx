import React from 'react'
import { AvatarPerfil } from './AvatarPerfil'
import { PastilhaEstado } from './PastilhaEstado'
import { TituloEcra } from './Tipografia'
import { AnnouncementsInboxButton } from '../AnnouncementsInbox'
import { SinalPagamentos } from '../SinalPagamentos'

/**
 * O cabeçalho de um ecrã: uma sobrancelha dourada, o nome do ecrã em grande e,
 * no canto, o sinal de pagamentos, o estado clínico, o sino dos comunicados e
 * a fotografia.
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
 *
 * **O canto tem uma linha sua, e o título fica por baixo com a largura toda.**
 * O título estava ao lado do canto, e com o sinal de € o canto leva quatro
 * coisas: sobravam 148px a 390px de largura, e dez dos dezasseis títulos
 * passavam por baixo do € — "Comunicados" em 104px, "Movimentos" em 78px. Um
 * título de 36px não cabe em 148px, e encolhê-lo até caber punha-o a 21px num
 * ecrã e a 36px no do lado: no Financeiro mudava de tamanho a cada separador.
 * É também o desenho do handoff, com o título inteiro por baixo de uma linha
 * de topo, e deixa o canto no mesmo sítio em todos os ecrãs — o da Home
 * incluído, que já estava na linha de cima.
 *
 * A sobrancelha fica na linha do canto, com a largura que já tinha ao lado
 * dele: numa linha só, cortada se não couber.
 */

export interface CabecalhoEcraProps {
  titulo: string
  /** Linha pequena e espaçada por cima do título. */
  sobrancelha?: string
  /** Linha discreta por baixo do título. */
  legenda?: string
  /** Ações à direita, antes da fotografia. */
  acoes?: React.ReactNode
  /** `id` do título, para uma região se nomear por ele (`aria-labelledby`). */
  idTitulo?: string
  className?: string
}

export const CabecalhoEcra: React.FC<CabecalhoEcraProps> = ({
  titulo,
  sobrancelha,
  legenda,
  acoes,
  idTitulo,
  className = '',
}) => (
  <header className={`pt-safe ${className}`}>
    <div className="flex items-center gap-3">
      {/* Numa linha só, e cortada se não couber: uma sobrancelha que
          quebrasse fazia o cabeçalho mudar de altura de ecrã para ecrã. */}
      <p className="flex-1 min-w-0 font-display font-extrabold text-[10px] tracking-[0.24em] text-csc-gold uppercase truncate">
        {sobrancelha}
      </p>
      {acoes}
      <SinalPagamentos />
      <PastilhaEstado />
      <AnnouncementsInboxButton tone="dark" size="md" />
      <AvatarPerfil tamanho={38} />
    </div>
    {/* `break-words` é a última rede: nenhum título de hoje precisa dela com a
        largura toda, mas uma palavra que não coubesse nunca passaria da coluna. */}
    <TituloEcra id={idTitulo} className="mt-2 break-words">{titulo}</TituloEcra>
    {legenda && <p className="text-[11px] text-white/62 mt-1.5">{legenda}</p>}
  </header>
)

export default CabecalhoEcra
