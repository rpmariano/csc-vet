import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trophy, Shield, Plus, Search, X, Edit2, Trash2, Save, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { extractRolesFromProfile } from '../../context/AuthContext'
import { toast } from '../../context/ToastContext'
import { triggerHaptic } from '../../utils/haptics'
import { useModalA11y } from '../../hooks/useModalA11y'
import { useAlteracoesPorGravar } from '../../hooks/useAlteracoesPorGravar'
import { UnsavedChangesModal } from '../UnsavedChangesModal'
import { ConfirmModal } from '../ConfirmModal'
import { LeagueManager } from '../LeagueManager'
import { CAMPO, ETIQUETA } from './comum'
import {
  DEFAULT_TOURNAMENT_RULES, redistributeInstallments,
  type Torneio, type TournamentRules,
} from './torneios'

/*
  Torneios e jornadas (ecrã 9a, e o gestor de liga).

  Era o quarto separador do `AdminDashboard`; hoje é um ecrã aberto a partir
  do Clube. O formulário das regras veio inteiro, tal como estava — são regras
  de prova, não desenho, e reescrevê-las era arriscar perder uma.

  O `?criar=jornada` da folha do [+] chega aqui: abre o gestor de liga do
  torneio a decorrer, que é onde uma jornada se cria.
*/

export const GestaoTorneios: React.FC = () => {
  const [params, setParams] = useSearchParams()

  const [tournaments, setTorneios] = useState<Torneio[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [tourSearch, setTourSearch] = useState('')
  const [tourStatusFilter, setTourStatusFilter] = useState<'all' | 'agendado' | 'ativo' | 'terminado'>('all')

  const [isTourModalOpen, setIsTourModalOpen] = useState(false)
  const [gestorDeLiga, setGestorDeLiga] = useState<string | null>(null)
  const [editingTourId, setEditingTourId] = useState<string | null>(null)
  const [tourName, setTourName] = useState('')
  const [tourSeason, setTourSeason] = useState('')
  const [tourStatus, setTourStatus] = useState<'agendado' | 'ativo' | 'terminado'>('agendado')
  const [tourOrganizerName, setTourOrganizerName] = useState('')
  const [tourImage, setTourImage] = useState<File | null>(null)
  const [existingTourImageUrl, setExistingTourImageUrl] = useState<string | null>(null)
  const [uploadingTourImage, setUploadingTourImage] = useState(false)
  const [tourRules, setTourRules] = useState<TournamentRules>(DEFAULT_TOURNAMENT_RULES)
  const [tourPlayers, setTourPlayers] = useState<string[]>([])
  /* Os inscritos vêm da rede depois de o formulário abrir; até chegarem, o
     guarda de alterações não tira a fotografia. */
  const [inscritosCarregados, setInscritosCarregados] = useState(true)

  const [confirmacao, setConfirmacao] = useState<{
    isOpen: boolean
    title: string
    description?: string
    onConfirm: () => void | Promise<void>
  }>({ isOpen: false, title: '', onConfirm: () => {} })

  const carregar = async () => {
    const [resTorneios, resPlantel] = await Promise.all([
      supabase.from('tournaments').select('*').order('created_at', { ascending: false }),
      supabase.from('v_players_public')
        .select('id, name, shirt_name, jersey_number, birth_date, photo_url, position, role, roles')
        .order('name'),
    ])
    setTorneios((resTorneios.data as Torneio[]) ?? [])
    setProfiles(resPlantel.data ?? [])
  }

  useEffect(() => { carregar() }, [])

  /*
    O [+] da barra manda para cá com `?criar=jornada`. Uma jornada nasce dentro
    de um torneio, por isso abre-se o gestor de liga do que estiver a decorrer.
  */
  useEffect(() => {
    if (params.get('criar') !== 'jornada' || tournaments.length === 0) return
    const emCurso = tournaments.find(t => t.status === 'ativo') ?? tournaments[0]
    setGestorDeLiga(emCurso.id)
    const seguintes = new URLSearchParams(params)
    seguintes.delete('criar')
    setParams(seguintes, { replace: true })
  }, [params, setParams, tournaments])

  const abrirCriacao = () => {
    triggerHaptic('light')
    setEditingTourId(null)
    setTourName('')
    setTourSeason('')
    setTourStatus('agendado')
    setTourOrganizerName('')
    setTourImage(null)
    setExistingTourImageUrl(null)
    setTourRules(DEFAULT_TOURNAMENT_RULES)
    setTourPlayers([])
    setInscritosCarregados(true)
    setIsTourModalOpen(true)
  }

  const abrirEdicao = async (t: Torneio) => {
    triggerHaptic('light')
    setEditingTourId(t.id)
    setTourName(t.name)
    setTourSeason(t.season || '')
    setTourStatus(t.status)
    setTourOrganizerName(t.organizer_name || '')
    setTourImage(null)
    setExistingTourImageUrl(t.image_url || null)
    setTourRules(t.rules || DEFAULT_TOURNAMENT_RULES)
    setTourPlayers([])
    setInscritosCarregados(false)
    setIsTourModalOpen(true)

    const { data } = await supabase.from('tournament_players').select('player_id').eq('tournament_id', t.id)
    setTourPlayers((data ?? []).map(linha => linha.player_id))
    setInscritosCarregados(true)
  }

  /*
    Uma categoria de despesa própria para a inscrição deste torneio, criada
    uma vez só. Reaproveita se já existir com o mesmo nome, já que
    `expense_categories.name` é único: cobre reabrir o formulário sem gravar,
    e torneios com nomes repetidos. Fica `allow_income` para também se poder
    criar um Encargo nesta categoria e cobrar aos jogadores.
  */
  const garantirCategoriaDeInscricao = async (nomeDoTorneio: string): Promise<string | null> => {
    const nome = 'Inscrição — ' + nomeDoTorneio
    try {
      const { data: existente } = await supabase
        .from('expense_categories').select('id').eq('name', nome).maybeSingle()
      if (existente) return existente.id
      const { data, error } = await supabase
        .from('expense_categories').insert([{ name: nome, allow_income: true }]).select('id').single()
      if (error) throw error
      return data.id
    } catch (err) {
      console.error('Erro ao criar a categoria de inscrição do torneio:', err)
      return null
    }
  }

  const gravar = async () => {
    if (!tourName.trim()) {
      toast.warning('O nome da competição é obrigatório.')
      return
    }

    setUploadingTourImage(true)
    let urlDaImagem: string | null = existingTourImageUrl

    try {
      let regras = tourRules
      if (tourRules.registration_fee && !tourRules.registration_fee.category_id) {
        const categoria = await garantirCategoriaDeInscricao(tourName.trim())
        if (categoria) {
          regras = { ...tourRules, registration_fee: { ...tourRules.registration_fee, category_id: categoria } }
        }
      }

      if (tourImage) {
        const extensao = tourImage.name.split('.').pop()
        const ficheiro = 'tournament_' + Math.random() + '.' + extensao
        const { error: erroUpload } = await supabase.storage
          .from('club_assets').upload(ficheiro, tourImage, { upsert: true })
        if (erroUpload) throw erroUpload
        const { data } = supabase.storage.from('club_assets').getPublicUrl(ficheiro)
        urlDaImagem = data.publicUrl
      }

      const valores = {
        name: tourName.trim(),
        season: tourSeason.trim(),
        status: tourStatus,
        organizer_name: tourOrganizerName.trim() || null,
        image_url: urlDaImagem,
        rules: regras,
      }

      const id = editingTourId
      if (id) {
        const { error } = await supabase.from('tournaments').update(valores).eq('id', id)
        if (error) throw error
        /* Apagar e reinserir: a lista de inscritos é curta, e um diff não
           compensa o risco de a deixar meia escrita. */
        await supabase.from('tournament_players').delete().eq('tournament_id', id)
        if (tourPlayers.length > 0) {
          await supabase.from('tournament_players')
            .insert(tourPlayers.map(pid => ({ tournament_id: id, player_id: pid })))
        }
        toast.success('Torneio atualizado com sucesso!')
      } else {
        const { data, error } = await supabase.from('tournaments').insert([valores]).select().single()
        if (error) throw error
        if (data && tourPlayers.length > 0) {
          await supabase.from('tournament_players')
            .insert(tourPlayers.map(pid => ({ tournament_id: data.id, player_id: pid })))
        }
        toast.success('Torneio criado com sucesso!')
      }

      setIsTourModalOpen(false)
      carregar()
    } catch (err: any) {
      toast.error('Erro ao guardar torneio: ' + (err.message || 'Erro'))
    } finally {
      setUploadingTourImage(false)
    }
  }

  const aoSubmeter = async (e: React.FormEvent) => {
    e.preventDefault()
    await gravar()
  }

  /* Os inscritos entram na comparação ordenados: a ordem em que os nomes
     chegam da rede não é uma alteração de quem está a editar. */
  const guarda = useAlteracoesPorGravar({
    aberto: isTourModalOpen,
    pronto: inscritosCarregados,
    valores: [
      editingTourId, tourName, tourSeason, tourStatus, tourOrganizerName,
      tourImage?.name ?? null, tourRules, [...tourPlayers].sort(),
    ],
    aoGravar: gravar,
    aoSair: () => setIsTourModalOpen(false),
    descricao: 'As alterações a este torneio ainda não foram gravadas. Se saíres agora, perdem-se.',
  })
  const painelRef = useModalA11y({ isOpen: isTourModalOpen, onClose: guarda.tentarFechar })

  const eliminar = (id: string, nome: string) => {
    setConfirmacao({
      isOpen: true,
      title: 'Eliminar torneio',
      description: 'Tens a certeza que desejas eliminar o torneio "' + nome + '"?',
      onConfirm: async () => {
        setConfirmacao(prev => ({ ...prev, isOpen: false }))
        const { error } = await supabase.from('tournaments').delete().eq('id', id)
        if (error) {
          toast.error('Erro ao eliminar torneio: ' + error.message)
          return
        }
        toast.success('Torneio eliminado!')
        carregar()
      },
    })
  }

  const filtrados = tournaments.filter(t => {
    const q = tourSearch.toLowerCase().trim()
    const bateNoTexto = !q || t.name.toLowerCase().includes(q) || (t.season && t.season.toLowerCase().includes(q))
    const bateNoEstado = tourStatusFilter === 'all' || t.status === tourStatusFilter
    return bateNoTexto && bateNoEstado
  })

  return (
    <>
      <div className="space-y-4">
        {/*
          O [+] fica ao lado da caixa de procura, e os estados numa fila
          própria por baixo: estavam os três na mesma linha, numa coluna com o
          botão à direita, e a pastilha "Terminado" corria por baixo dele.
        */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/62" />
            <input
              type="text"
              value={tourSearch}
              onChange={e => setTourSearch(e.target.value)}
              placeholder="Pesquisar por nome ou época da competição..."
              aria-label="Pesquisar torneios"
              className={`${CAMPO} pl-9.5`}
            />
            {tourSearch && (
              <button
                type="button"
                onClick={() => setTourSearch('')}
                aria-label="Limpar pesquisa"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/62 hover:text-white/80"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={abrirCriacao}
            className="w-11 h-11 rounded-full bg-csc-gold text-csc-tinta flex items-center justify-center shrink-0 cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            <Plus size={19} />
            <span className="sr-only">Criar torneio</span>
          </button>
        </div>

        <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl">
          {(['all', 'ativo', 'agendado', 'terminado'] as const).map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setTourStatusFilter(st)}
              className={`flex-1 min-h-11 px-2 rounded-lg text-xs font-black capitalize transition-all cursor-pointer ${
                tourStatusFilter === st
                  ? 'bg-white text-csc-tinta shadow-xs'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {st === 'all' ? 'Todos' : st}
            </button>
          ))}
        </div>

        {/* Lista de Torneios */}
        <div className="cartao-simples text-white p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs font-bold text-white/70">
            <span>A apresentar {filtrados.length} de {tournaments.length} torneios registados</span>
          </div>

          {filtrados.length === 0 ? (
            <div className="text-center py-12 text-white/60">
              <Trophy size={40} className="mx-auto mb-2 opacity-60" />
              <p className="font-bold text-sm text-white/70">Nenhum torneio encontrado</p>
              <p className="text-xs text-white/65 mt-0.5">Tente alterar os filtros ou adicione uma nova competição.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {filtrados.map(t => (
                <div 
                  key={t.id} 
                  className="flex justify-between items-center p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Trophy size={17} className="text-csc-gold" />
                      <div>
                        <h4 className="font-black text-sm text-white">{t.name}</h4>
                        {t.season && (
                          <p className="text-xs text-white/70 font-semibold">Época: {t.season}</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className={`inline-block text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        t.status === 'ativo' ? 'bg-csc-light/15 text-csc-verde-texto border border-csc-light/35' :
                        t.status === 'terminado' ? 'bg-white/10 text-white/70' :
                        'bg-csc-gold/15 text-csc-gold border border-csc-gold/35'
                      }`}>
                        {t.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setGestorDeLiga(t.id)}
                      className="w-11 h-11 flex items-center justify-center bg-white/10 border border-white/10 hover:border-blue-400 text-blue-300 hover:bg-blue-500/10 rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                      title="Gerir Grupos e Equipas"
                    >
                      <Shield size={14} />
                    </button>
                    <button
                      onClick={() => abrirEdicao(t)}
                      className="w-11 h-11 flex items-center justify-center bg-white/10 border border-white/10 hover:border-csc-gold text-white/70 hover:text-csc-gold rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                      title="Editar Regras e Detalhes"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => eliminar(t.id, t.name)}
                      className="w-11 h-11 flex items-center justify-center bg-white/10 border border-white/10 hover:border-red-400 text-red-400 hover:bg-red-500/10 rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                      title="Eliminar Torneio"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isTourModalOpen && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            ref={painelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clube-torneio-titulo"
            tabIndex={-1}
            className="bg-csc-superficie text-white w-full max-w-3xl rounded-3xl shadow-2xl border border-white/12 overflow-hidden animate-scale-in flex flex-col max-h-[90vh] outline-none"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Trophy size={22} className="text-csc-gold" />
                <h3 id="clube-torneio-titulo" className="font-black text-lg">
                  {editingTourId ? 'Editar Torneio' : 'Criar Novo Torneio'}
                </h3>
              </div>
              <button
                onClick={guarda.tentarFechar}
                aria-label="Fechar"
                className="w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <X size={18} className="stroke-[2.5]" />
              </button>
            </div>

            <form onSubmit={aoSubmeter} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className={ETIQUETA}>
                  Nome da Competição *
                </label>
                <input
                  type="text"
                  required
                  value={tourName}
                  onChange={e => setTourName(e.target.value)}
                  placeholder="Ex: Liga Veteranos AF Lisboa"
                  className={CAMPO}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={ETIQUETA}>
                    Época Desportiva
                  </label>
                  <input
                    type="text"
                    value={tourSeason}
                    onChange={e => setTourSeason(e.target.value)}
                    placeholder="Ex: 2025/2026"
                    className={CAMPO}
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>
                    Estado do Torneio
                  </label>
                  <select
                    value={tourStatus}
                    onChange={e => setTourStatus(e.target.value as any)}
                    className={CAMPO}
                  >
                    <option value="agendado">Agendado</option>
                    <option value="ativo">Ativo (Em Curso)</option>
                    <option value="terminado">Terminado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={ETIQUETA}>
                  Empresa Organizadora
                </label>
                <input
                  type="text"
                  value={tourOrganizerName}
                  onChange={e => setTourOrganizerName(e.target.value)}
                  placeholder="Ex: Associação de Futebol de Lisboa"
                  className={CAMPO}
                />
              </div>

              <div>
                <label className={ETIQUETA}>
                  Imagem do Torneio
                </label>
                {existingTourImageUrl && !tourImage && (
                  <div className="flex items-center gap-3 mb-2 p-2 bg-white/5 border border-white/10 rounded-xl">
                    <img src={existingTourImageUrl} alt="Imagem Atual" className="w-10 h-10 object-contain p-1 bg-white rounded-lg border border-white/20" />
                    <span className="text-xs text-white/60 font-medium truncate flex-1">Imagem atualmente guardada</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setTourImage(e.target.files ? e.target.files[0] : null)}
                  className="w-full px-4 py-2 border border-white/15 rounded-xl text-xs bg-white/5 text-white/70 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-csc-gold file:text-csc-tinta"
                />
                <p className="text-[11px] text-white/62 font-medium mt-1">Acompanha os ecrãs desta competição (Gestão da Liga, Classificações, badges de jogo).</p>
              </div>

              <details className="mt-4 border border-white/10 rounded-xl bg-white/5 overflow-hidden group">
                <summary className="px-4 py-3 text-sm font-bold text-white/80 cursor-pointer flex justify-between items-center hover:bg-white/10 transition-colors">
                  <span>Regras da prova (opcional)</span>
                  <ChevronDown size={15} className="text-white/62 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-white/10 grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto">
                
                  <h4 className="col-span-1 sm:col-span-2 text-xs font-black text-white/62 uppercase tracking-wider mb-[-5px]">Formato da Competição</h4>
                  <div className="col-span-1 sm:col-span-2">
                    <label className={ETIQUETA}>Modelo de Liga</label>
                    <select 
                      value={tourRules.format || 'single_league'} 
                      onChange={e => setTourRules({...tourRules, format: e.target.value as any})} 
                      className={CAMPO}
                    >
                      <option value="single_league">Liga Única (1 Fase)</option>
                      <option value="two_phases">2 Fases (Grupos + Fase Final)</option>
                    </select>
                  </div>

                  <h4 className="col-span-1 sm:col-span-2 text-xs font-black text-white/62 uppercase tracking-wider mb-[-5px] mt-2">Idades & Inscrições</h4>
                  <div>
                    <label className={ETIQUETA}>Idade Mínima</label>
                    <input type="number" min="0" value={tourRules.min_age} onChange={e => setTourRules({...tourRules, min_age: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Permitir Exceções</label>
                    <select value={tourRules.exceptions_allowed ? 'true' : 'false'} onChange={e => setTourRules({...tourRules, exceptions_allowed: e.target.value === 'true'})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white">
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  </div>
                  <div>
                    <label className={ETIQUETA}>Máx. Exceções de Idade</label>
                    <input type="number" min="0" value={tourRules.exceptions_count} onChange={e => setTourRules({...tourRules, exceptions_count: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" disabled={!tourRules.exceptions_allowed} />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Idade Mín. da Exceção</label>
                    <input type="number" min="0" value={tourRules.exceptions_min_age} onChange={e => setTourRules({...tourRules, exceptions_min_age: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" disabled={!tourRules.exceptions_allowed} />
                  </div>

                  <h4 className="col-span-1 sm:col-span-2 text-xs font-black text-white/62 uppercase tracking-wider mb-[-5px] mt-2">Plantel & Convocatórias</h4>
                  <div>
                    <label className={ETIQUETA}>Máx. Inscritos (Plantel)</label>
                    <input type="number" min="0" value={tourRules.max_squad_size} onChange={e => setTourRules({...tourRules, max_squad_size: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Máx. Convocados / Jogo</label>
                    <input type="number" min="0" value={tourRules.max_match_players} onChange={e => setTourRules({...tourRules, max_match_players: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>

                  <h4 className="col-span-1 sm:col-span-2 text-xs font-black text-white/62 uppercase tracking-wider mb-[-5px] mt-2">Duração do Jogo & Subs</h4>
                  <div>
                    <label className={ETIQUETA}>Duração Total (mins)</label>
                    <input type="number" min="0" value={tourRules.match_duration_mins} onChange={e => setTourRules({...tourRules, match_duration_mins: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Duração 1ª Parte (mins)</label>
                    <input type="number" min="0" value={tourRules.half_duration_mins} onChange={e => setTourRules({...tourRules, half_duration_mins: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>
                
                  <h4 className="col-span-1 sm:col-span-2 text-xs font-black text-white/62 uppercase tracking-wider mb-[-5px] mt-2">Disciplina & Sanções</h4>
                  <div>
                    <label className={ETIQUETA}>Amarelos para Suspensão</label>
                    <input type="number" min="0" value={tourRules.yellow_cards_to_suspension} onChange={e => setTourRules({...tourRules, yellow_cards_to_suspension: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Resultado p/ Falta Comp.</label>
                    <input type="text" value={tourRules.walkover_score} onChange={e => setTourRules({...tourRules, walkover_score: e.target.value})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" placeholder="Ex: 5-0" />
                  </div>
                </div>
              </details>

              <details className="mt-4 border border-white/10 rounded-xl bg-white/5 overflow-hidden group">
                <summary className="px-4 py-3 text-sm font-bold text-white/80 cursor-pointer flex justify-between items-center hover:bg-white/10 transition-colors">
                  <span>Inscrição na prova (opcional)</span>
                  <ChevronDown size={15} className="text-white/62 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-white/10 space-y-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-white/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!tourRules.registration_fee}
                      onChange={e => setTourRules(prev => ({
                        ...prev,
                        registration_fee: e.target.checked
                          ? { total: 0, installments: [{ amount: 0, due_date: '', paid: false }] }
                          : undefined
                      }))}
                      className="w-4 h-4 text-csc-tinta rounded"
                    />
                    Esta prova tem valor de inscrição a pagar
                  </label>

                  {tourRules.registration_fee && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={ETIQUETA}>Valor Total (€)</label>
                          <input
                            key={editingTourId || 'new'}
                            type="number" min="0" step="0.01"
                            defaultValue={tourRules.registration_fee.total}
                            // Não controlado: o valor só é lido e gravado no estado quando se
                            // sai do campo (onBlur), não a cada tecla. Ligar o campo
                            // diretamente a um número controlado ("value={...Number(...)}")
                            // fazia-o "lutar" com o utilizador — apagar para escrever de novo
                            // ficava sempre preso a 0. A key muda por torneio para o campo
                            // reiniciar corretamente ao abrir para editar um torneio diferente.
                            onBlur={e => {
                              const val = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value))
                              e.target.value = String(val)
                              setTourRules(prev => {
                                const rf = prev.registration_fee!
                                // Só reparte se o total mudou mesmo — sem isto, tocar no campo
                                // sem alterar o valor (ex.: só para confirmar) apagava ajustes
                                // manuais já feitos em tranches individuais.
                                if (val === rf.total) return prev
                                const installments = redistributeInstallments(rf.installments, val, rf.installments.length)
                                return { ...prev, registration_fee: { ...rf, total: val, installments } }
                              })
                            }}
                            className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className={ETIQUETA}>Nº de Tranches</label>
                          <input
                            key={editingTourId || 'new'}
                            type="number" min="1" max="6"
                            defaultValue={tourRules.registration_fee.installments.length}
                            onBlur={e => setTourRules(prev => {
                              const rf = prev.registration_fee!
                              const n = e.target.value === '' ? rf.installments.length : Math.max(1, Math.min(6, Number(e.target.value)))
                              e.target.value = String(n) // corrige visualmente se escreveu fora de 1–6
                              if (n === rf.installments.length) return prev
                              const installments = redistributeInstallments(rf.installments, rf.total, n)
                              return { ...prev, registration_fee: { ...rf, installments } }
                            })}
                            className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-white/62 -mt-1">
                        Mudar o Valor Total ou o Nº de Tranches reparte o valor em partes iguais pelas tranches ainda por pagar. Depois disso, cada tranche pode ser ajustada à mão abaixo.
                      </p>

                      <div className="space-y-2">
                        {tourRules.registration_fee.installments.map((inst, idx) => (
                          <div key={idx} className="grid grid-cols-3 gap-2 items-end p-2.5 bg-white/6 rounded-lg border border-white/10">
                            <div>
                              <label className={ETIQUETA}>Tranche {idx + 1} — Valor (€)</label>
                              <input
                                // O valor entra na key: como o campo não é controlado (ver nota
                                // no Valor Total), sem isto o input não mostrava o valor
                                // recalculado quando o Total ou o Nº de Tranches mudavam — só
                                // remonta (e por isso só atualiza o que se vê) quando o valor
                                // desta tranche muda por essa via ou por edição própria.
                                key={`${editingTourId || 'new'}-${idx}-${inst.amount}`}
                                type="number" min="0" step="0.01"
                                defaultValue={inst.amount}
                                disabled={inst.paid}
                                onBlur={e => {
                                  const val = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value))
                                  e.target.value = String(val)
                                  setTourRules(prev => {
                                    const rf = prev.registration_fee!
                                    const installments = rf.installments.map((it, i) => i === idx ? { ...it, amount: val } : it)
                                    return { ...prev, registration_fee: { ...rf, installments } }
                                  })
                                }}
                                className="w-full px-2.5 py-1.5 border border-white/12 rounded-lg text-xs text-white disabled:bg-white/10"
                              />
                            </div>
                            <div>
                              <label className={ETIQUETA}>Prazo</label>
                              <input
                                type="date"
                                value={inst.due_date}
                                disabled={inst.paid}
                                onChange={e => setTourRules(prev => {
                                  const rf = prev.registration_fee!
                                  const installments = rf.installments.map((it, i) => i === idx ? { ...it, due_date: e.target.value } : it)
                                  return { ...prev, registration_fee: { ...rf, installments } }
                                })}
                                className="w-full px-2.5 py-1.5 border border-white/12 rounded-lg text-xs text-white disabled:bg-white/10"
                              />
                            </div>
                            <div className="text-xs font-bold">
                              {inst.paid ? (
                                <span className="text-csc-verde-texto bg-csc-light/10 px-2 py-1 rounded-lg border border-csc-light/25">✓ Paga</span>
                              ) : (
                                <span className="text-csc-gold bg-csc-gold/10 px-2 py-1 rounded-lg border border-csc-gold/25">Por pagar</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-white/62">
                        Ao guardar, cria-se automaticamente a categoria de despesa "Inscrição — {tourName.trim() || 'nome do torneio'}". O valor total já entra na previsão financeira antes de ser pago, e cada tranche pode ser paga depois na página Financeiro & Quotas.
                      </p>
                    </>
                  )}
                </div>
              </details>

              {editingTourId ? (
                <div className="mt-4 border border-white/10 rounded-xl bg-white/5 overflow-hidden flex flex-col max-h-[350px]">
                  <div className="px-4 py-3 bg-white/10 border-b border-white/10 flex justify-between items-center">
                    <div>
                      <h4 className="text-sm font-bold text-white">Plantel Inscrito</h4>
                      <p className="text-[10px] text-white/70 uppercase font-bold tracking-wider mt-0.5">
                        {tourPlayers.length} / {tourRules.max_squad_size} Inscritos
                      </p>
                    </div>
                  </div>
                  <div className="p-3 overflow-y-auto space-y-2 flex-1">
                    {(() => {
                      const currentExceptionsCount = tourPlayers.filter(pid => {
                        const pData = profiles.find(pr => pr.id === pid)
                        if (!pData) return false
                        const pAge = pData.birth_date ? Math.floor((new Date().getTime() - new Date(pData.birth_date).getTime()) / 3.15576e+10) : null
                        return pAge !== null && pAge < (tourRules.min_age || 0)
                      }).length

                      // Só quem tem o papel de Jogador é elegível para inscrição em torneio —
                      // membros só Treinador ou só Direção não entram nesta lista.
                      return profiles.filter(p => extractRolesFromProfile(p).includes('player')).map(p => {
                        const age = p.birth_date ? Math.floor((new Date().getTime() - new Date(p.birth_date).getTime()) / 3.15576e+10) : null
                        const isTooYoung = age !== null && age < (tourRules.min_age || 0)
                        const isExceptionButValid = isTooYoung && tourRules.exceptions_allowed && age >= tourRules.exceptions_min_age
                      
                        // Disable if too young and exceptions not allowed, or too young and under the min exception age
                        let isInvalid = isTooYoung && !isExceptionButValid
                        const isSelected = tourPlayers.includes(p.id)

                        // If not selected, too young (but valid exception), and we already reached the max exceptions limit, block selection
                        if (!isSelected && isExceptionButValid && currentExceptionsCount >= (tourRules.exceptions_count || 0)) {
                          isInvalid = true
                        }
                        const playerPositions = p.position ? p.position.split(',').map((pos: string) => pos.trim()).filter(Boolean) : []

                        return (
                          <label key={p.id} className={`flex items-center justify-between p-2.5 rounded-xl border ${isSelected ? 'border-csc-light/45 bg-csc-light/15' : 'border-white/12 bg-white/5'} ${isInvalid ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/10'} transition-colors`}>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-[rgba(11,45,11,.9)] border border-csc-gold/35 overflow-hidden shrink-0 flex items-center justify-center">
                                <span className="font-display text-sm font-black text-csc-gold">{p.jersey_number || '-'}</span>
                              </div>
                              <div>
                                <p className="text-xs font-black text-white">{p.shirt_name || p.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {age !== null && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isTooYoung ? (isExceptionButValid ? 'bg-csc-gold/15 text-csc-gold' : 'bg-csc-red/15 text-csc-vermelho-texto') : 'bg-csc-light/16 text-csc-verde-texto'}`}>
                                      {age} anos
                                    </span>
                                  )}
                                  {playerPositions.map((pos: string, idx: number) => (
                                    <span key={idx} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-csc-blue/20 text-csc-azul-texto">
                                      {pos}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isInvalid}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    if (tourPlayers.length >= tourRules.max_squad_size) {
                                      toast.warning(`Limite de plantel (${tourRules.max_squad_size}) atingido!`)
                                      return
                                    }
                                    if (isExceptionButValid && currentExceptionsCount >= (tourRules.exceptions_count || 0)) {
                                      toast.warning(`Limite de exceções de idade (${tourRules.exceptions_count || 0}) atingido!`)
                                      return
                                    }
                                    setTourPlayers(prev => [...prev, p.id])
                                  } else {
                                    setTourPlayers(prev => prev.filter(id => id !== p.id))
                                  }
                                }}
                                className="w-4 h-4 text-csc-tinta border-white/15 rounded focus:ring-csc-dark"
                              />
                            </div>
                          </label>
                        )
                      })
                    })()}
                  </div>
                </div>
              ) : (
                <div className="mt-4 p-4 border border-blue-400/30 bg-blue-500/10 rounded-xl text-center">
                  <p className="text-xs font-bold text-blue-300">Guarda o torneio primeiro para poderes inscrever o plantel da tua equipa.</p>
                </div>
              )}

              <div className="pt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={guarda.tentarFechar}
                  className="px-5 py-2.5 border border-white/15 rounded-xl font-bold text-sm text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadingTourImage}
                  className="px-6 py-2.5 bg-csc-gold text-csc-tinta rounded-xl font-black text-sm hover:brightness-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-98 disabled:opacity-60"
                >
                  <Save size={16} className="text-csc-tinta" />
                  <span>{uploadingTourImage ? 'A guardar...' : editingTourId ? 'Atualizar Torneio' : 'Guardar Torneio'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {gestorDeLiga && (
        <LeagueManager
          tournamentId={gestorDeLiga}
          onClose={() => setGestorDeLiga(null)}
        />
      )}

      <UnsavedChangesModal {...guarda.props} />

      <ConfirmModal
        isOpen={confirmacao.isOpen}
        title={confirmacao.title}
        description={confirmacao.description}
        confirmText="Sim, eliminar torneio"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={confirmacao.onConfirm}
        onCancel={() => setConfirmacao(prev => ({ ...prev, isOpen: false }))}
      />
    </>
  )
}

export default GestaoTorneios
