import React, { useState } from 'react'
import { Share2, MessageCircle, Copy, Check } from 'lucide-react'
import {
  copiarLinkConvocatoria,
  partilharConvocatoriaWhatsApp,
} from '../../lib/convocatoriaPartilha'
import type {
  EventoPartilha,
  OpcoesPartilha,
} from '../../lib/convocatoriaPartilha'
import { enderecoEvento } from '../../lib/rotas'

interface PartilharConvocatoriaProps {
  evento: EventoPartilha
  opcoes?: OpcoesPartilha
  /** Variante compacta para barras de ações ou ecrãs com pouco espaço. */
  compacto?: boolean
  className?: string
}

export const PartilharConvocatoria: React.FC<PartilharConvocatoriaProps> = ({
  evento,
  opcoes,
  compacto = false,
  className = '',
}) => {
  const [copiado, setCopiado] = useState(false)
  const url = enderecoEvento(evento.id)

  const handleCopiar = async () => {
    const sucesso = await copiarLinkConvocatoria(evento.id)
    if (sucesso) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    }
  }

  const handleWhatsApp = () => {
    partilharConvocatoriaWhatsApp(evento, opcoes)
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
          title="Partilhar no WhatsApp"
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
          title="Copiar link da convocatória"
        >
          {copiado ? <Check size={14} className="text-csc-verde-texto" /> : <Copy size={14} />}
          <span>{copiado ? 'Copiado!' : 'Copiar link'}</span>
        </button>
      </div>
    )
  }

  return (
    <div className={`rounded-2xl bg-white/[0.06] border border-white/10 p-3.5 sm:p-4 space-y-3 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-csc-gold/15 text-csc-gold flex items-center justify-center shrink-0">
            <Share2 size={16} />
          </div>
          <div>
            <p className="font-display font-bold text-sm text-white leading-tight">
              Partilhar convocatória
            </p>
            <p className="text-[11px] text-white/60 leading-snug">
              Os atletas convocados podem confirmar a presença diretamente na app pelo link.
            </p>
          </div>
        </div>
      </div>

      {/* Caixa do Link */}
      <div className="flex items-center gap-2 bg-black/25 px-3 py-2 rounded-xl border border-white/10 text-xs">
        <span className="text-white/60 truncate flex-1 select-all font-mono text-[11px]">
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
          <span>{copiado ? 'Copiado!' : 'Copiar link'}</span>
        </button>
      </div>
    </div>
  )
}
