import React, { useEffect, useMemo, useState } from 'react'
import type { PropsDaSeccao } from './seccao'
import {
  Download,
  Filter,
  RefreshCw,
  ChevronDown,
  History,
  User,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react'
import {
  ACarregar,
  EstadoVazio,
  Pastilha,
  CaixaProcura,
  BotaoIcone,
} from '../ui'
import {
  obterAuditLogs,
  MODULOS_AUDITORIA,
  NOMES_TABELAS,
  NOMES_CAMPOS,
  formatarValorCampo,
  type AuditLog,
  type AcaoAuditoria,
} from '../../lib/auditoria'
import { contemTexto } from '../../lib/texto'
import { triggerHaptic } from '../../utils/haptics'
import { toast } from '../../context/ToastContext'

export const RegistoAuditoria: React.FC<PropsDaSeccao> = ({ cabecalho }) => {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [moduloFiltro, setModuloFiltro] = useState<string>('todos')
  const [acaoFiltro, setAcaoFiltro] = useState<string>('todas')
  const [procura, setProcura] = useState('')
  const [idExpandido, setIdExpandido] = useState<string | null>(null)
  const [atualizando, setAtualizando] = useState(false)

  const carregarLogs = async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    else setAtualizando(true)

    const { logs: dados, error } = await obterAuditLogs({
      modulo: moduloFiltro,
      acao: acaoFiltro,
      limite: 200,
    })

    if (error) {
      toast.error('Erro ao carregar registos de auditoria')
    } else {
      setLogs(dados)
    }

    setLoading(false)
    setAtualizando(false)
  }

  useEffect(() => {
    carregarLogs()
  }, [moduloFiltro, acaoFiltro])

  const logsFiltrados = useMemo(() => {
    if (!procura.trim()) return logs

    return logs.filter(log => {
      return (
        contemTexto(log.user_name || '', procura) ||
        contemTexto(log.user_email || '', procura) ||
        contemTexto(log.record_title || '', procura) ||
        contemTexto(log.description || '', procura) ||
        contemTexto(NOMES_TABELAS[log.table_name] || log.table_name, procura)
      )
    })
  }, [logs, procura])

  const exportarRelatorio = () => {
    triggerHaptic('selection')
    if (logsFiltrados.length === 0) {
      toast.error('Não existem registos para exportar')
      return
    }

    try {
      const exportData = logsFiltrados.map(l => ({
        data_hora: l.created_at,
        acao: l.action,
        modulo: NOMES_TABELAS[l.table_name] || l.table_name,
        entidade: l.record_title || l.record_id,
        utilizador: l.user_name,
        email: l.user_email,
        papel: l.user_role,
        descricao: l.description,
        alteracoes: l.changes,
      }))

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      a.href = url
      a.download = `csc-auditoria-${timestamp}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('Registo de auditoria exportado com sucesso!')
    } catch {
      toast.error('Falha ao exportar registos de auditoria')
    }
  }

  const formatarDataHora = (iso: string) => {
    try {
      const d = new Date(iso)
      const dia = String(d.getDate()).padStart(2, '0')
      const mes = String(d.getMonth() + 1).padStart(2, '0')
      const ano = d.getFullYear()
      const horas = String(d.getHours()).padStart(2, '0')
      const mins = String(d.getMinutes()).padStart(2, '0')
      const segs = String(d.getSeconds()).padStart(2, '0')
      return `${dia}/${mes}/${ano} ${horas}:${mins}:${segs}`
    } catch {
      return iso
    }
  }

  const renderBadgeAcao = (acao: AcaoAuditoria) => {
    switch (acao) {
      case 'INSERT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            + Criação
          </span>
        )
      case 'UPDATE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
            ✎ Alteração
          </span>
        )
      case 'DELETE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
            ✕ Eliminação
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-white/10 text-white/70 border border-white/20">
            {acao}
          </span>
        )
    }
  }

  const alternarExpandido = (id: string) => {
    triggerHaptic('selection')
    setIdExpandido(prev => (prev === id ? null : id))
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho da secção com ações */}
      {cabecalho(
        <div className="flex items-center gap-2">
          <BotaoIcone
            rotulo="Recarregar registos"
            icone={RefreshCw}
            onClick={() => carregarLogs(true)}
            className={`text-white/60 hover:text-white ${atualizando ? 'animate-spin' : ''}`}
          />
          <BotaoIcone
            rotulo="Exportar auditoria (JSON)"
            icone={Download}
            onClick={exportarRelatorio}
            destaque
          />
        </div>,
      )}

      {/* Caixa de Procura rápida */}
      <CaixaProcura
        valor={procura}
        aoMudar={setProcura}
        rotulo="Procurar registos de auditoria"
        placeholder="Procurar por utilizador, entidade, ação..."
      />

      {/* Filtros por Módulo */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-widest text-white/40">
          <Layers size={12} />
          <span>Módulo</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {Object.entries(MODULOS_AUDITORIA).map(([chave, mod]) => (
            <Pastilha
              key={chave}
              ativa={moduloFiltro === chave}
              onClick={() => {
                triggerHaptic('selection')
                setModuloFiltro(chave)
              }}
            >
              {mod.nome}
            </Pastilha>
          ))}
        </div>
      </div>

      {/* Filtros por Ação */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-widest text-white/40">
          <Filter size={12} />
          <span>Ação</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <Pastilha
            ativa={acaoFiltro === 'todas'}
            onClick={() => {
              triggerHaptic('selection')
              setAcaoFiltro('todas')
            }}
          >
            Todas
          </Pastilha>
          <Pastilha
            ativa={acaoFiltro === 'insert'}
            onClick={() => {
              triggerHaptic('selection')
              setAcaoFiltro('insert')
            }}
          >
            Criações
          </Pastilha>
          <Pastilha
            ativa={acaoFiltro === 'update'}
            onClick={() => {
              triggerHaptic('selection')
              setAcaoFiltro('update')
            }}
          >
            Alterações
          </Pastilha>
          <Pastilha
            ativa={acaoFiltro === 'delete'}
            onClick={() => {
              triggerHaptic('selection')
              setAcaoFiltro('delete')
            }}
          >
            Eliminações
          </Pastilha>
        </div>
      </div>

      {/* Resumo da consulta */}
      <div className="flex items-center justify-between text-xs text-white/50 px-1 pt-1">
        <span>{logsFiltrados.length} registo(s) encontrado(s)</span>
        {logsFiltrados.length > 0 && (
          <span className="text-[11px] text-white/35">Mais recentes primeiro</span>
        )}
      </div>

      {/* Lista de Registos de Auditoria */}
      {loading ? (
        <div className="py-12">
          <ACarregar texto="A carregar registos de auditoria..." />
        </div>
      ) : logsFiltrados.length === 0 ? (
        <EstadoVazio
          icone={History}
          titulo="Nenhum registo de auditoria"
          texto={
            procura || moduloFiltro !== 'todos' || acaoFiltro !== 'todas'
              ? 'Nenhum evento corresponde aos filtros selecionados.'
              : 'Ainda não existem alterações gravadas na base de dados.'
          }
        />
      ) : (
        <div className="space-y-2.5">
          {logsFiltrados.map(log => {
            const expandido = idExpandido === log.id
            const mudancas = log.changes as Record<string, { antigo?: unknown; novo?: unknown }> | null
            const temMudancas = mudancas && Object.keys(mudancas).length > 0

            return (
              <div
                key={log.id}
                className="bg-white/[0.04] border border-white/10 hover:border-white/20 rounded-2xl overflow-hidden transition-all duration-150"
              >
                {/* Linha principal clicável */}
                <button
                  type="button"
                  onClick={() => alternarExpandido(log.id)}
                  className="w-full p-3.5 text-left flex flex-col gap-2 cursor-pointer select-none"
                >
                  {/* Linha superior: Ação, Módulo, Data */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {renderBadgeAcao(log.action)}
                      <span className="text-[11px] font-bold text-white/60">
                        {NOMES_TABELAS[log.table_name] || log.table_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-white/40 tabular-nums">
                      <Calendar size={12} />
                      <span>{formatarDataHora(log.created_at)}</span>
                    </div>
                  </div>

                  {/* Descrição do Evento */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm text-white/95 leading-snug">
                      {log.description || log.record_title || 'Alteração efetuada'}
                    </p>
                    <ChevronDown
                      size={16}
                      className={`text-white/40 flex-shrink-0 transition-transform duration-200 mt-0.5 ${
                        expandido ? 'rotate-180 text-csc-gold' : ''
                      }`}
                    />
                  </div>

                  {/* Informação do Autor */}
                  <div className="flex items-center gap-2 text-xs text-white/50 pt-0.5">
                    <User size={13} className="text-white/35 flex-shrink-0" />
                    <span className="truncate">
                      {log.user_name || 'Sistema'}
                      {log.user_role ? ` (${log.user_role})` : ''}
                    </span>
                    {log.user_email && (
                      <span className="text-white/30 text-[11px] truncate">· {log.user_email}</span>
                    )}
                  </div>
                </button>

                {/* Bloco expandido de detalhes e diferenças */}
                {expandido && (
                  <div className="px-3.5 pb-3.5 pt-2 border-t border-white/10 bg-black/20 space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-white/45">
                      <span>ID do registo: <code className="text-white/60">{log.record_id}</code></span>
                      {log.record_title && (
                        <span>Entidade: <strong className="text-white/70">{log.record_title}</strong></span>
                      )}
                    </div>

                    {log.action === 'UPDATE' && temMudancas ? (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-csc-gold">
                          Campos Alterados ({Object.keys(mudancas).length}):
                        </span>

                        <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                          {Object.entries(mudancas).map(([campo, diff]) => {
                            const nomeCampoAmigavel = NOMES_CAMPOS[campo] || campo
                            const valorAntigo = diff && typeof diff === 'object' && 'antigo' in diff
                              ? (diff as { antigo: unknown }).antigo
                              : undefined
                            const valorNovo = diff && typeof diff === 'object' && 'novo' in diff
                              ? (diff as { novo: unknown }).novo
                              : undefined

                            return (
                              <div key={campo} className="p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="font-bold text-white/70 sm:w-1/3">
                                  {nomeCampoAmigavel}
                                </span>

                                <div className="flex items-center gap-2 sm:w-2/3 flex-wrap">
                                  <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 text-[11.5px] border border-rose-500/20 line-through">
                                    {formatarValorCampo(campo, valorAntigo)}
                                  </span>
                                  <ArrowRight size={13} className="text-white/30 flex-shrink-0" />
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[11.5px] border border-emerald-500/20 font-medium">
                                    {formatarValorCampo(campo, valorNovo)}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : log.action === 'INSERT' && log.new_data ? (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
                          Dados Criados:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {Object.entries(log.new_data)
                            .filter(([k, v]) => v !== null && v !== '' && !['created_at', 'updated_at'].includes(k))
                            .slice(0, 10)
                            .map(([k, v]) => (
                              <div key={k} className="p-2 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-between gap-2">
                                <span className="text-white/50 text-[11px]">{NOMES_CAMPOS[k] || k}:</span>
                                <span className="text-white/90 font-medium truncate">{formatarValorCampo(k, v)}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : log.action === 'DELETE' && log.old_data ? (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">
                          Dados Eliminados:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {Object.entries(log.old_data)
                            .filter(([k, v]) => v !== null && v !== '' && !['created_at', 'updated_at'].includes(k))
                            .slice(0, 8)
                            .map(([k, v]) => (
                              <div key={k} className="p-2 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-between gap-2">
                                <span className="text-white/50 text-[11px]">{NOMES_CAMPOS[k] || k}:</span>
                                <span className="text-rose-300/90 font-medium truncate">{formatarValorCampo(k, v)}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-white/40 italic">
                        Sem detalhes adicionais para esta operação.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
