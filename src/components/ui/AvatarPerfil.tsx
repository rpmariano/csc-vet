import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSaidaGuardada } from '../../context/SaidaGuardadaContext'
import { useAuth } from '../../context/AuthContext'

/**
 * A fotografia do canto — a porta para o Perfil, em todos os ecrãs.
 *
 * No redesenho não há barra de topo nem menu: é isto que abre a ficha de
 * quem está a usar a app. Sem fotografia mostra o número da camisola, e sem
 * número a inicial do nome; o círculo nunca fica vazio, porque é ele que
 * marca o canto.
 *
 * Tinha um lápis no canto, na Home, a convidar a editar. Saiu: o cabeçalho é o
 * mesmo em toda a app, e a fotografia é sempre a mesma porta — um lápis num
 * ecrã e não nos outros fazia parecer que abriam sitios diferentes.
 */

export interface AvatarPerfilProps {
  /** 38 nos cabeçalhos; 44 por omissão. */
  tamanho?: number
  className?: string
}

export const AvatarPerfil: React.FC<AvatarPerfilProps> = ({
  tamanho = 44,
  className = '',
}) => {
  const { profile } = useAuth()
  /* O avatar está em todos os cabeçalhos, e é uma das saídas de um ecrã com
     formulário — pergunta antes de deixar para trás o que não foi gravado.
     Acima do `return null`: um hook corre em todos os renders ou em nenhum. */
  const navegar = useNavigate()
  const { pedirSaida } = useSaidaGuardada()

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
      onClick={e => { if (!pedirSaida(() => navegar('/settings'))) e.preventDefault() }}
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
    </Link>
  )
}

export default AvatarPerfil
