import React from 'react'
import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

/**
 * A fotografia do canto — a porta para o Perfil, em todos os ecrãs.
 *
 * No redesenho não há barra de topo nem menu: é isto que abre a ficha de
 * quem está a usar a app. Sem fotografia mostra o número da camisola, e sem
 * número a inicial do nome; o círculo nunca fica vazio, porque é ele que
 * marca o canto.
 *
 * O lápis é o convite a editar, e só aparece na Home — nos outros ecrãs a
 * fotografia é um atalho discreto, não uma ação.
 */

export interface AvatarPerfilProps {
  /** 46 na Home, 44 nos cabeçalhos de ecrã. */
  tamanho?: number
  /** Mostra o lápis no canto inferior. */
  comLapis?: boolean
  className?: string
}

export const AvatarPerfil: React.FC<AvatarPerfilProps> = ({
  tamanho = 44,
  comLapis = false,
  className = '',
}) => {
  const { profile } = useAuth()
  if (!profile) return null

  /*
    O `name` é `NOT NULL` na base mas pode não estar aqui: um registo pelo
    Google sem nome no perfil, ou o instante entre a sessão chegar e a ficha
    ser lida. Sem esta guarda o avatar rebentava, e o avatar está em todos os
    ecrãs — a app inteira ficava num ecrã preto sem saída.
  */
  const dentro = profile.jersey_number ?? profile.name?.trim().charAt(0).toUpperCase() ?? '·'

  return (
    <Link
      to="/settings"
      aria-label="Ver o meu perfil"
      className={`relative flex-none rounded-full border-2 border-csc-gold/60 flex items-center justify-center overflow-visible
        font-display font-extrabold text-csc-gold transition-transform duration-150 active:scale-97
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${className}`}
      style={{
        width: tamanho,
        height: tamanho,
        fontSize: tamanho * 0.3,
        background: profile.photo_url ? undefined : 'linear-gradient(140deg,#3a4143,#1b1f20)',
        boxShadow: '0 8px 20px -8px rgba(0,0,0,.9)',
      }}
    >
      {profile.photo_url ? (
        <img
          src={profile.photo_url}
          alt=""
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <span>{dentro}</span>
      )}

      {comLapis && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -bottom-1 w-[18px] h-[18px] rounded-full bg-[#181c1d]
            border border-white/20 flex items-center justify-center text-white/75"
        >
          <Pencil size={9} strokeWidth={2.5} />
        </span>
      )}
    </Link>
  )
}

export default AvatarPerfil
