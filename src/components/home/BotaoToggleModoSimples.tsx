import React from 'react'
import { Sparkles, Layers } from 'lucide-react'
import { triggerHaptic } from '../../utils/haptics'

export interface BotaoToggleModoSimplesProps {
  modoSimples: boolean
  aoAlternar: () => void
}

export const BotaoToggleModoSimples: React.FC<BotaoToggleModoSimplesProps> = ({
  modoSimples,
  aoAlternar,
}) => {
  return (
    <div className="w-full">
      <button
        type="button"
        role="switch"
        aria-checked={modoSimples}
        onClick={() => {
          triggerHaptic('selection')
          aoAlternar()
        }}
        className={`w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl cursor-pointer transition-all duration-200 select-none border-2 shadow-lg ${
          modoSimples
            ? 'bg-gradient-to-r from-csc-dark via-[#1c5520] to-csc-dark border-csc-gold shadow-[0_4px_24px_rgba(227,192,77,0.25)]'
            : 'bg-csc-superficie/95 hover:bg-csc-superficie border-white/20 hover:border-csc-gold/50'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 text-left">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors shadow ${
              modoSimples
                ? 'bg-csc-gold text-csc-tinta font-black'
                : 'bg-white/10 text-csc-gold'
            }`}
          >
            {modoSimples ? <Sparkles size={20} /> : <Layers size={20} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-[14px] text-white leading-tight">
                Modo Simples
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-display font-black uppercase tracking-wider ${
                  modoSimples
                    ? 'bg-csc-gold text-csc-tinta'
                    : 'bg-white/15 text-white/70'
                }`}
              >
                {modoSimples ? 'Ativo' : 'Desativado'}
              </span>
            </div>
            <p className="text-[11px] text-white/70 truncate mt-0.5">
              {modoSimples
                ? 'Tudo num só ecrã · Toca para voltar ao menu completo'
                : 'Toca para ver Dívidas, Eventos, Próximo Jogo e Classificação'}
            </p>
          </div>
        </div>

        {/* Toggle switch visual */}
        <div
          className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
            modoSimples ? 'bg-csc-gold' : 'bg-white/25'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
              modoSimples ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </div>
      </button>
    </div>
  )
}

export default BotaoToggleModoSimples
