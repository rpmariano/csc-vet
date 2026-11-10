import React, { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useModoSimples } from '../../context/ModoSimplesContext'
import { triggerHaptic } from '../../utils/haptics'
import { useAuth, isDeveloperEmail } from '../../context/AuthContext'
import { useClub } from '../../context/ClubContext'
import { useEpocaAtual } from '../../hooks/useEpocaAtual'
import { formatClubSigla } from '../../lib/siglas'
import { obterEmblemaEfetivo } from '../../lib/sincronizarEquipas'
import { useFichaPorLigar } from '../FichaPorLigar'
import { AvatarPerfil, PastilhaEstado } from '../ui'
import { AnnouncementsInboxButton } from '../AnnouncementsInbox'
import { SinalPagamentos } from '../SinalPagamentos'

export const CabecalhoApp: React.FC = () => {
  const { profile, assignedRoles, isUnassigned } = useAuth()
  const { clubSettings } = useClub()
  const semPerfil = !isDeveloperEmail(profile?.email) && (isUnassigned || profile?.role === 'unassigned' || profile?.status === 'inactive')
  const estadoDaFicha = useFichaPorLigar(profile, assignedRoles)
  const semFicha = semPerfil || estadoDaFicha === 'por-ligar'

  const epoca = useEpocaAtual()
  const { modoSimples, alternarModoSimples } = useModoSimples()

  const [rolado, setRolado] = useState(false)
  useEffect(() => {
    const medir = () => setRolado(window.scrollY > 4)
    medir()
    window.addEventListener('scroll', medir, { passive: true })
    return () => window.removeEventListener('scroll', medir)
  }, [])

  if (!profile) return null

  const emblema = obterEmblemaEfetivo(clubSettings?.logo_url, 'Cascais', 'CSC') || '/csc-vet/cascais-emblem.png'
  const sigla = formatClubSigla(clubSettings?.initials)

  return (
    <header
      className={`sticky top-0 z-40 pt-safe transition-[background-color,border-color,box-shadow] duration-200 border-b ${
        rolado
          ? 'bg-csc-dark/92 backdrop-blur-md border-white/10 shadow-[0_6px_18px_rgba(0,0,0,0.28)]'
          : 'bg-transparent border-transparent'
      }`}
    >
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

        {/* Botão de alternância do Modo Simples no cabeçalho */}
        <button
          type="button"
          onClick={() => { triggerHaptic('selection'); alternarModoSimples() }}
          title={modoSimples ? 'Modo Simples (Ativo) - Toca para voltar ao menu completo' : 'Toca para ativar o Modo Simples'}
          aria-label={`Modo Simples: ${modoSimples ? 'ativado' : 'desativado'}`}
          className={`h-9 px-2.5 rounded-full flex items-center gap-1.5 font-display font-black text-[11px] transition-all cursor-pointer border ${
            modoSimples
              ? 'bg-csc-gold text-csc-tinta border-csc-gold shadow-[0_0_12px_rgba(227,192,77,0.5)]'
              : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
          }`}
        >
          <Sparkles size={14} className={modoSimples ? 'text-csc-tinta' : 'text-csc-gold'} />
          <span>{modoSimples ? 'Simples' : 'Modo'}</span>
        </button>

        {!semFicha && <SinalPagamentos />}
        {!semFicha && <PastilhaEstado />}
        {!semPerfil && <AnnouncementsInboxButton tone="dark" size="md" />}
        <AvatarPerfil tamanho={38} />
      </div>
    </header>
  )
}

export default CabecalhoApp
