import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Shield, Save, Upload, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useClub } from '../../context/ClubContext'
import { toast } from '../../context/ToastContext'
import { useAlteracoesPorGravar } from '../../hooks/useAlteracoesPorGravar'
import { useGuardaDeSaida } from '../../context/SaidaGuardadaContext'
import { CAMPO, ETIQUETA, type Campo } from './comum'

/*
  Dados do clube — nome, sigla, emblema e campo de casa.

  Era o primeiro separador do `AdminDashboard`; hoje é um ecrã aberto a partir
  do Clube. O emblema grava-se sozinho ao escolher o ficheiro, e por isso fica
  de fora do guarda de alterações: quando o diálogo do sistema fecha, a imagem
  já está no servidor.
*/

const AVISO_POR_GRAVAR =
  'Os dados do clube ainda não foram gravados. Se saíres agora, perdem-se.'

export const DadosDoClube: React.FC = () => {
  const { clubSettings, refreshSettings } = useClub()
  const [campos, setCampos] = useState<Campo[]>([])
  const [nome, setNome] = useState('')
  const [sigla, setSigla] = useState('')
  const [campoDeCasa, setCampoDeCasa] = useState('')
  const [aEnviarEmblema, setAEnviarEmblema] = useState(false)
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    supabase.from('fields').select('*').order('name').then(({ data }) => {
      setCampos((data as Campo[]) ?? [])
    })
  }, [])

  useEffect(() => {
    if (!clubSettings) return
    setNome(clubSettings.name)
    setSigla(clubSettings.initials)
    setCampoDeCasa(clubSettings.home_field_id || localStorage.getItem('csc_club_home_field_id') || '')
    /* Só a partir daqui o formulário representa o clube — ver o `pronto` do
       guarda: sem isto a fotografia era tirada com os campos ainda vazios. */
    setCarregado(true)
  }, [clubSettings])

  const gravar = async () => {
    if (!nome.trim() || !sigla.trim()) {
      toast.warning('O nome e a sigla do clube são obrigatórios.')
      return
    }
    localStorage.setItem('csc_club_home_field_id', campoDeCasa)
    const { error } = await supabase
      .from('club_settings')
      .update({ name: nome.trim(), initials: sigla.trim(), home_field_id: campoDeCasa || null })
      .eq('id', 1)

    if (error) {
      toast.error('Erro ao guardar os dados do clube: ' + error.message)
      return
    }
    toast.success('Dados do clube atualizados!')
    guarda.marcarComoGravado()
    refreshSettings()
  }

  /* O ecrã não fecha — sai-se dele a navegar —, por isso o guarda regista-se
     no contexto de saída e a barra de baixo pergunta antes de levar embora. */
  const guarda = useAlteracoesPorGravar({
    aberto: true,
    pronto: carregado,
    valores: [nome, sigla, campoDeCasa],
    aoGravar: gravar,
    aoSair: () => {},
    descricao: AVISO_POR_GRAVAR,
  })

  useGuardaDeSaida({
    sujo: guarda.sujo,
    gravar,
    descricao: AVISO_POR_GRAVAR,
  })

  const enviarEmblema = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    setAEnviarEmblema(true)
    try {
      const ficheiro = e.target.files[0]
      const extensao = ficheiro.name.split('.').pop()
      const caminho = `logo_${Math.random()}.${extensao}`

      const { error: erroUpload } = await supabase.storage
        .from('club_assets')
        .upload(caminho, ficheiro, { upsert: true })
      if (erroUpload) throw erroUpload

      const { data } = supabase.storage.from('club_assets').getPublicUrl(caminho)
      const { error: erroUpdate } = await supabase
        .from('club_settings')
        .update({ logo_url: data.publicUrl })
        .eq('id', 1)
      if (erroUpdate) throw erroUpdate

      toast.success('Emblema atualizado com sucesso!')
      refreshSettings()
    } catch (err: any) {
      toast.error('Erro ao carregar o emblema: ' + err.message)
    } finally {
      setAEnviarEmblema(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="cartao-simples text-white p-4">
        <form onSubmit={e => { e.preventDefault(); gravar() }} className="space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Building2 size={20} className="text-csc-gold" />
              <span>Identificação do clube</span>
            </h3>
          </div>

          <div>
            <label className={ETIQUETA} htmlFor="clube-nome">Nome oficial *</label>
            <input
              id="clube-nome"
              type="text"
              required
              value={nome}
              onChange={e => setNome(e.target.value)}
              className={CAMPO}
              placeholder="Ex: Grupo Dramático e Sportivo de Cascais"
            />
          </div>

          <div>
            <label className={ETIQUETA} htmlFor="clube-sigla">Sigla *</label>
            <input
              id="clube-sigla"
              type="text"
              required
              value={sigla}
              onChange={e => setSigla(e.target.value)}
              className={CAMPO}
              placeholder="Ex: CSC"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className={`${ETIQUETA} mb-0`} htmlFor="clube-campo-casa">Campo de casa</label>
              <Link
                to="/clube?ver=campos"
                className="min-h-11 flex items-center gap-1 text-xs text-csc-gold font-black hover:underline cursor-pointer"
              >
                <Plus size={13} />
                <span>Gerir campos</span>
              </Link>
            </div>
            <select
              id="clube-campo-casa"
              value={campoDeCasa}
              onChange={e => setCampoDeCasa(e.target.value)}
              className={CAMPO}
            >
              <option value="">— Selecionar campo de casa —</option>
              {campos.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.address ? ` · ${c.address}` : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-white/70 mt-1.5 font-medium">
              É o campo atribuído por omissão aos jogos em casa e aos treinos.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full min-h-12 px-6 bg-csc-gold text-csc-tinta rounded-xl font-black text-sm hover:brightness-95 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <Save size={17} className="text-csc-tinta" />
              <span>Guardar dados do clube</span>
            </button>
          </div>
        </form>
      </div>

      <div className="cartao-simples text-white p-4">
        <h3 className="text-base font-black text-white border-b border-white/10 pb-3 flex items-center gap-2">
          <Shield size={18} className="text-csc-gold" />
          <span>Emblema do clube</span>
        </h3>

        <div className="my-6 flex justify-center">
          <div className="w-36 h-36 bg-white/5 border-2 border-dashed border-white/15 rounded-2xl flex items-center justify-center overflow-hidden p-3">
            {clubSettings?.logo_url ? (
              <img src={clubSettings.logo_url} alt="Emblema do clube" className="w-full h-full object-contain" />
            ) : (
              <Shield size={48} className="text-white/20" />
            )}
          </div>
        </div>

        <p className="text-xs text-white/70 text-center font-medium leading-relaxed">
          Um PNG com fundo transparente é o que fica melhor sobre a faixa verde.
        </p>

        <div className="mt-6 pt-4 border-t border-white/10">
          <input
            type="file"
            accept="image/*"
            onChange={enviarEmblema}
            disabled={aEnviarEmblema}
            className="hidden"
            id="clube-emblema"
          />
          <label
            htmlFor="clube-emblema"
            className={`w-full min-h-11 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-all border ${
              aEnviarEmblema
                ? 'bg-white/5 text-white/60 border-white/10 cursor-not-allowed'
                : 'bg-white/10 border-white/15 text-white hover:bg-white/20 active:scale-98'
            }`}
          >
            {aEnviarEmblema ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-csc-gold" />
                <span>A carregar imagem...</span>
              </>
            ) : (
              <>
                <Upload size={15} className="text-csc-gold" />
                <span>Carregar novo emblema</span>
              </>
            )}
          </label>
        </div>
      </div>
    </div>
  )
}

export default DadosDoClube
