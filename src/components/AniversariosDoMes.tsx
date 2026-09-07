import React, { useEffect, useState } from 'react'
import { Cake } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { CartaoSimples } from './ui'

/**
 * Aniversários do mês, para a Agenda quando não há nada marcado (ecrã 11b).
 *
 * A regra é a do handoff: **só aparecem quando não há eventos**. Assim a
 * Agenda nunca fica uma página em branco — passa semanas vazia, que é o normal
 * fora de época — e num mês cheio não competem com os jogos e os treinos.
 *
 * O componente faz a sua própria consulta em vez de a pendurar no
 * carregamento da Agenda, precisamente porque só é montado no caso vazio: num
 * mês com eventos não custa nada, porque nem chega a existir.
 *
 * A lista é `v_players_public` e não `profiles` — é plantel, e a vista é o que
 * qualquer autenticado pode ler. É a mesma que a Home usa para os anos de quem
 * faz hoje.
 */

interface Aniversariante {
  id: string
  nome: string
  dia: number
}

/** Alcunha, nome da camisola, ou o primeiro nome — como no resto da app. */
function comoSeTrata(p: { name?: string | null; nickname?: string | null; shirt_name?: string | null }): string {
  const preferido = p.nickname?.trim() || p.shirt_name?.trim()
  if (preferido) return preferido
  const proprio = p.name?.trim()
  return proprio ? proprio.split(/\s+/)[0] : 'atleta'
}

export const AniversariosDoMes: React.FC<{ mes: number }> = ({ mes }) => {
  const [pessoas, setPessoas] = useState<Aniversariante[]>([])

  useEffect(() => {
    let cancelado = false

    supabase
      .from('v_players_public')
      .select('id, name, nickname, shirt_name, birth_date, status')
      .then(({ data }) => {
        if (cancelado) return
        const linhas = (data ?? []) as {
          id: string
          name: string | null
          nickname: string | null
          shirt_name: string | null
          birth_date: string | null
          status: string | null
        }[]

        setPessoas(
          linhas
            .filter(p => p.birth_date && p.status !== 'inactive')
            .map(p => ({ pessoa: p, data: new Date(p.birth_date as string) }))
            .filter(({ data }) => data.getMonth() === mes)
            .sort((a, b) => a.data.getDate() - b.data.getDate())
            .map(({ pessoa, data }) => ({
              id: pessoa.id,
              nome: comoSeTrata(pessoa),
              dia: data.getDate(),
            })),
        )
      })

    return () => { cancelado = true }
  }, [mes])

  if (pessoas.length === 0) return null

  return (
    <CartaoSimples className="flex items-center gap-3 px-4 py-3.5 bg-csc-blue/15 border-csc-blue/30">
      <span
        className="w-8 h-8 rounded-[10px] bg-csc-blue/25 border border-csc-blue/35
          flex items-center justify-center text-csc-azul-texto flex-none"
      >
        <Cake size={15} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-display font-bold text-[12.5px] text-white">
          Aniversários deste mês
        </span>
        <span className="block text-[10.5px] text-white/55 mt-0.5">
          {pessoas.map(p => `${p.nome} a ${p.dia}`).join(', ')}
        </span>
      </span>
    </CartaoSimples>
  )
}

export default AniversariosDoMes
