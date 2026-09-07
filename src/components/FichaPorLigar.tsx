import React from 'react'
import { Unlink } from 'lucide-react'
import type { Profile } from '../context/AuthContext'
import { CartaoVidro, CartaoSimples, EtiquetaSeccao } from './ui'

/**
 * Conta criada, ficha por ligar (ecrã 11a).
 *
 * Neste clube as fichas do plantel são criadas pela direção **antes** de as
 * pessoas se registarem. Quando alguém se regista, o `AuthContext` tenta ligar
 * sozinho por email (`find_my_profile_match({ p_email_only: true })`), e o
 * `AutoAssociationModal` propõe a ficha quando bate o telefone ou o nome.
 *
 * O caso que faltava é o terceiro: registou-se com um email que não está na
 * ficha, e nem o telefone nem o nome deram correspondência. Aí não aparecia
 * mensagem nenhuma — a pessoa via a app normal, sem convocatórias e sem
 * aparecer no plantel, sem uma linha que explicasse porquê. Hoje, uma das oito
 * contas registadas está exatamente neste estado.
 *
 * **Sem ação nenhuma para o próprio**, e em especial sem o "Preencher o meu
 * perfil" que o handoff desenhava: preencher dados numa ficha órfã cria uma
 * segunda ficha da mesma pessoa, que é precisamente o que o ecrã 3d existe
 * para desfazer. O que se pode fazer é dizer o email do registo a quem liga as
 * contas — daí ele estar aqui, em texto que se lê e se copia.
 */

/**
 * A conta ficou sem ficha de atleta?
 *
 * A base da condição é a que a RPC `admin_contas_sem_atleta()` usa do lado da
 * direção: sem número de camisola, sem número de sócio, sem data de nascimento
 * e sem posição é uma ficha que só a criação automática da conta escreveu —
 * nome e email, e mais nada.
 *
 * **Mas essa condição sozinha não chega aqui, e a diferença é cara.** Listar
 * alguém a mais num ecrã de admin é um incómodo; substituir-lhe a Home é
 * tirar-lhe a app. Em produção há exatamente uma conta que a condição da RPC
 * apanha, e é a de um treinador — sem camisola nem posição porque não joga,
 * com 48 convocatórias e a ficha perfeitamente ligada. Com a condição em cru,
 * essa pessoa abria a app e via "a tua ficha não está ligada".
 *
 * Daí a segunda metade: quem tem papel de treinador ou de direção tem a ficha
 * que quer ter. O ecrã 11a é para o jogador que se registou e não bateu certo
 * com nenhuma ficha do plantel.
 */
export function fichaPorLigar(
  perfil: Profile | null | undefined,
  papeis: readonly string[],
): boolean {
  if (!perfil) return false
  if (papeis.some(p => p === 'coach' || p === 'admin')) return false
  return !(
    perfil.jersey_number ||
    perfil.member_number ||
    perfil.birth_date ||
    perfil.position
  )
}

const ENTRETANTO = [
  'Ver a agenda e as classificações',
  'Ler os comunicados do clube',
  'Consultar as fichas dos jogos e as estatísticas',
] as const

export const FichaPorLigar: React.FC<{ perfil: Profile }> = ({ perfil }) => (
  <div className="space-y-4">
    <CartaoVidro className="p-[17px]">
      <div className="flex items-center gap-3">
        <span
          className="w-[34px] h-[34px] rounded-xl bg-csc-gold/20 border border-csc-gold/40
            flex items-center justify-center text-csc-gold flex-none"
        >
          <Unlink size={16} />
        </span>
        <p className="flex-1 font-display font-extrabold text-[15px] text-white text-pretty">
          A tua ficha existe, mas não está ligada
        </p>
      </div>

      <p className="text-[11.5px] leading-relaxed text-white/70 mt-3">
        Há uma ficha tua no plantel, mas a app não conseguiu ligá-la a esta conta — quase
        sempre porque o email do registo é diferente do que está na ficha. Até estar ligada
        não recebes convocatórias nem apareces no plantel.
      </p>

      {/*
        O email do registo, em texto e não numa imagem: é a única coisa que
        esta pessoa pode fazer — dizê-lo a quem liga as contas no 3d.
      */}
      <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-black/28 border border-csc-gold/25 mt-3.5">
        <EtiquetaSeccao como="p" className="text-csc-gold/85 text-[8.5px] flex-none">
          Registaste-te com
        </EtiquetaSeccao>
        <span className="flex-1 min-w-0 font-mono text-[11px] text-white text-right truncate">
          {perfil.email || 'sem email'}
        </span>
      </div>

      <p className="text-[11.5px] leading-relaxed text-white/70 mt-3">
        Diz este email a alguém da direção: liga a ficha em dois toques, e a app fica
        normal logo a seguir.
      </p>
    </CartaoVidro>

    <CartaoSimples className="p-[17px]">
      <EtiquetaSeccao como="p">Entretanto podes</EtiquetaSeccao>
      <ul className="flex flex-col gap-2.5 mt-3">
        {ENTRETANTO.map(linha => (
          <li key={linha} className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-csc-gold flex-none" aria-hidden="true" />
            <span className="flex-1 text-[11.5px] text-white/70">{linha}</span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] leading-normal text-white/40 mt-3.5 pt-3 border-t border-white/8">
        Não preenchas os teus dados neste estado: criava uma segunda ficha tua, e depois é
        a direção que tem de as juntar.
      </p>
    </CartaoSimples>
  </div>
)

export default FichaPorLigar
