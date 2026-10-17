import React, { useState } from 'react'
import { MessageCircle, Copy, Check, Award } from 'lucide-react'
import {
  copiarLinkFichaJogo,
  partilharFichaJogoWhatsApp,
} from '../../lib/mvp'
import { enderecoFichaJogo } from '../../lib/rotas'

interface PartilharFichaJogoProps {
  evento: any
  opcoes?: {
    adversarioNome?: string | null
    adversarioSigla?: string | null
    clubeNome?: string | null
    clubeSigla?: string | null
    campos?: readonly { id: string; name: string; address?: string | null }[]
  }
  /** Variante compacta para barras de ações ou botões inline. */
  compacto?: boolean
  className?: string
  aoFechar?: () => void
}

export const PartilharFichaJogo: React.FC<PartilharFichaJogoProps> = ({
  evento,
  opcoes,
  compacto = false,
  className = '',
}) => {
  const [copiado, setCopiado] = useState(false)
  const url = enderecoFichaJogo(evento?.id || '')

  const handleCopiar = async () => {
    if (!evento?.id) return
    const sucesso = await copiarLinkFichaJogo(evento.id)
    if (sucesso) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    }
  }

  const handleWhatsApp = () => {
    if (!evento) return
    partilharFichaJogoWhatsApp(evento, opcoes)
  }

  if (compacto) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          type="button"
          onClick={handleWhatsApp}
          className="h-10 px-3.5 rounded-2xl bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30
            font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer
            transition-transform duration-150 active:scale-97 border border-[#25D366]/30"
          title="Partilhar ficha no WhatsApp"
        >
          <MessageCircle size={14} />
          <span>WhatsApp</span>
        </button>
        <button
          type="button"
          onClick={handleCopiar}
          className="h-10 px-3.5 rounded-2xl bg-white/10 text-white hover:bg-white/15
            font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer
            transition-transform duration-150 active:scale-97 border border-white/15"
          title="Copiar link da ficha de jogo"
        >
          {copiado ? <Check size={14} className="text-csc-verde-texto" /> : <Copy size={14} />}
          <span>{copiado ? 'Copiado!' : 'Copiar link'}</span>
        </button>
      </div>
    )
  }

  return (
    <div className={`rounded-2xl bg-white/[0.06] border border-white/10 p-4 space-y-3.5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0 border border-csc-gold/30">
            <Award size={18} />
          </div>
          <div>
            <p className="font-display font-extrabold text-sm text-white leading-tight">
              Partilhar ficha & votação MVP
            </p>
            <p className="text-[11px] text-white/60 leading-snug">
              Avisa a equipa para consultar os dados do jogo e eleger os dois melhores em campo.
            </p>
          </div>
        </div>
      </div>

      {/* Caixa de Texto de Pré-visualização ou Link */}
      <div className="flex items-center gap-2 bg-black/35 px-3 py-2.5 rounded-xl border border-white/10 text-xs">
        <span className="text-white/65 truncate flex-1 select-all font-mono text-[11px]">
          {url}
        </span>
      </div>

      {/* Botões de Ação */}
      <div className="grid grid-cols-2 gap-2 pt-0.5">
        <button
          type="button"
          onClick={handleWhatsApp}
          className="min-h-11 px-3.5 rounded-2xl bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30
            font-display font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer
            transition-transform duration-150 active:scale-97 border border-[#25D366]/35"
        >
          <MessageCircle size={16} />
          <span>No WhatsApp</span>
        </button>

        <button
          type="button"
          onClick={handleCopiar}
          className="min-h-11 px-3.5 rounded-2xl bg-white/10 text-white hover:bg-white/15
            font-display font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer
            transition-transform duration-150 active:scale-97 border border-white/15"
        >
          {copiado ? <Check size={16} className="text-csc-verde-texto" /> : <Copy size={16} />}
          <span>{copiado ? 'Link copiado!' : 'Copiar link'}</span>
        </button>
      </div>
    </div>
  )
}
