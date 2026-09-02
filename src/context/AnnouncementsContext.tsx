import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

export interface Announcement {
  id: string
  title: string
  content: string
  published_at: string
  is_active?: boolean
}

interface AnnouncementsContextType {
  announcements: Announcement[]
  unreadCount: number
  isRead: (id: string) => boolean
  /** Marca como lido — chamado quando o atleta abre/expande o comunicado. */
  markAsRead: (id: string) => void
  loading: boolean
  refresh: () => Promise<void>
}

const AnnouncementsContext = createContext<AnnouncementsContextType | undefined>(undefined)

/**
 * Chave onde os comunicados lidos ficavam guardados, por utilizador e por
 * dispositivo. Já não é a fonte de verdade — isso é a tabela
 * `announcement_reads` — mas continua a ser lida uma vez, para levar o que
 * cada dispositivo tinha para a base de dados (ver migrarLeiturasLocais).
 */
const readStorageKey = (profileId: string) => `csc_read_announcements_${profileId}`

/** Marca de que a migração já foi feita nesta conta, neste dispositivo. */
const migratedStorageKey = (profileId: string) => `csc_read_announcements_migrados_${profileId}`

const lerIdsGuardadosLocalmente = (profileId: string): string[] => {
  try {
    const raw = localStorage.getItem(readStorageKey(profileId))
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export const AnnouncementsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  /**
   * Sobe para a base de dados o que este dispositivo tinha em localStorage,
   * uma única vez por conta e por dispositivo. Sem isto, ao passar a ler do
   * servidor, tudo o que já tinha sido lido voltava a aparecer por ler.
   * As linhas que já lá estejam são ignoradas, por isso correr isto duas
   * vezes não faz mal nenhum.
   */
  const migrarLeiturasLocais = useCallback(async (profileId: string) => {
    try {
      if (localStorage.getItem(migratedStorageKey(profileId)) === 'true') return
      const locais = lerIdsGuardadosLocalmente(profileId)
      if (locais.length > 0) {
        const { error } = await supabase
          .from('announcement_reads')
          .upsert(
            locais.map(id => ({ announcement_id: id, player_id: profileId })),
            { onConflict: 'announcement_id,player_id', ignoreDuplicates: true },
          )
        // Só se marca como migrado quando a escrita correu bem — se falhar,
        // tenta outra vez no próximo arranque em vez de perder o histórico.
        if (error) throw error
      }
      localStorage.setItem(migratedStorageKey(profileId), 'true')
    } catch (err) {
      console.error('Erro ao migrar comunicados lidos deste dispositivo:', err)
    }
  }, [])

  const fetchAnnouncements = useCallback(async () => {
    if (!profile) {
      setAnnouncements([])
      setReadIds(new Set())
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      await migrarLeiturasLocais(profile.id)

      const [{ data, error }, { data: reads, error: readsError }] = await Promise.all([
        supabase
          .from('announcements')
          .select('*')
          .order('published_at', { ascending: false }),
        // A RLS já limita as linhas às do próprio; o filtro é só para não
        // trazer o que não interessa.
        supabase
          .from('announcement_reads')
          .select('announcement_id')
          .eq('player_id', profile.id),
      ])

      if (error) throw error
      const ativos = ((data as Announcement[]) || []).filter(a => a.is_active !== false)
      setAnnouncements(ativos)

      if (readsError) throw readsError
      setReadIds(new Set((reads || []).map(r => r.announcement_id as string)))
    } catch (err) {
      console.error('Erro ao obter comunicados:', err)
    } finally {
      setLoading(false)
    }
  }, [profile, migrarLeiturasLocais])

  useEffect(() => {
    fetchAnnouncements()
  }, [fetchAnnouncements])

  const isRead = useCallback((id: string) => readIds.has(id), [readIds])

  /**
   * Marca no ecrã primeiro e grava a seguir: o badge tem de responder ao
   * toque, não à rede. Se a gravação falhar, desfaz-se a marcação para o
   * estado não mentir — o comunicado volta a contar como por ler.
   */
  const markAsRead = useCallback((id: string) => {
    if (!profile) return
    setReadIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })

    supabase
      .from('announcement_reads')
      .upsert(
        { announcement_id: id, player_id: profile.id },
        { onConflict: 'announcement_id,player_id', ignoreDuplicates: true },
      )
      .then(({ error }) => {
        if (!error) return
        console.error('Erro ao marcar comunicado como lido:', error.message)
        setReadIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      })
  }, [profile])

  const unreadCount = announcements.filter(a => !readIds.has(a.id)).length

  return (
    <AnnouncementsContext.Provider
      value={{ announcements, unreadCount, isRead, markAsRead, loading, refresh: fetchAnnouncements }}
    >
      {children}
    </AnnouncementsContext.Provider>
  )
}

export const useAnnouncements = () => {
  const context = useContext(AnnouncementsContext)
  if (context === undefined) {
    throw new Error('useAnnouncements deve ser usado dentro de um AnnouncementsProvider')
  }
  return context
}
