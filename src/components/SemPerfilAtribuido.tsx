import React from 'react'
import { Link } from 'react-router-dom'
import { Phone, MessageCircle, LogOut, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { formatClubSigla } from '../lib/siglas'
import { CartaoSimples } from './ui'

/**
 * Ecrã de boas-vindas para novos registos sem correspondência na base de dados.
 * O utilizador não tem papel de jogador nem menus atribuídos, podendo apenas
 * consultar esta mensagem, contactar o Rui Mariano ou fazer logout pelo perfil.
 */
export const SemPerfilAtribuido: React.FC = () => {
  const { profile, user, signOut } = useAuth()
  const { clubSettings } = useClub()

  const emblema = clubSettings?.logo_url || '/csc-vet/cascais-emblem.png'
  const sigla = formatClubSigla(clubSettings?.initials)

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center py-6 px-2 text-center animate-fade-in">
      {/* Emblema do Cascais */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-white p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)] border-2 border-csc-gold/70 flex items-center justify-center">
          {emblema ? (
            <img src={emblema} alt={sigla} className="w-full h-full object-contain" />
          ) : (
            <Shield size={44} className="text-csc-dark" />
          )}
        </div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-csc-gold text-csc-tinta font-display font-black text-[10px] tracking-widest uppercase shadow">
          GDSC
        </div>
      </div>

      {/* Cartão principal com lettering do Cascais */}
      <CartaoSimples className="w-full max-w-md p-6 sm:p-8 space-y-6 border-csc-gold/30 bg-white/[0.08] shadow-2xl backdrop-blur-xl">
        {/* Título com lettering do Cascais */}
        <div>
          <h1 className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight leading-tight">
            Bem vindo á nossa app!
          </h1>
        </div>

        {/* Mensagem solicitada */}
        <div className="py-2">
          <p className="font-display font-bold text-base sm:text-lg text-white/95 leading-relaxed">
            Não desesperes, para atribuição de perfil, contacta o{' '}
            <span className="text-csc-gold">Rui Mariano</span>:
          </p>
        </div>

        {/* Botão de contacto direto com o Rui Mariano */}
        <div className="flex flex-col gap-3 pt-1">
          <a
            href="tel:913663956"
            className="w-full h-14 rounded-2xl bg-csc-gold text-csc-tinta font-display font-black text-lg flex items-center justify-center gap-3 shadow-lg shadow-csc-gold/25 hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Phone size={20} className="stroke-[2.5]" />
            <span>913663956</span>
          </a>

          <a
            href={`https://wa.me/351913663956?text=${encodeURIComponent(
              `Olá Rui, registei-me na app do Cascais com o email ${profile?.email || user?.email || ''} para atribuição de perfil.`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-11 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 font-display font-bold text-xs flex items-center justify-center gap-2 hover:bg-emerald-600/30 active:scale-[0.98] transition-all cursor-pointer"
          >
            <MessageCircle size={16} />
            <span>Enviar mensagem no WhatsApp</span>
          </a>
        </div>

        {/* Informação da conta registada */}
        <div className="pt-4 border-t border-white/10 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">
            Conta com sessão iniciada
          </p>
          <p className="font-mono text-xs text-white/80 mt-1 truncate px-2">
            {profile?.email || user?.email || 'Sem email'}
          </p>
        </div>
      </CartaoSimples>

      {/* Opção para aceder ao perfil ou terminar sessão */}
      <div className="mt-6 flex items-center gap-4 text-xs">
        <Link
          to="/settings"
          className="text-white/60 hover:text-white font-medium underline underline-offset-4 transition-colors"
        >
          O meu perfil
        </Link>
        <span className="text-white/20">·</span>
        <button
          type="button"
          onClick={() => signOut()}
          className="inline-flex items-center gap-1.5 text-rose-400/80 hover:text-rose-300 font-medium cursor-pointer transition-colors"
        >
          <LogOut size={13} />
          <span>Terminar sessão</span>
        </button>
      </div>
    </div>
  )
}

export default SemPerfilAtribuido
