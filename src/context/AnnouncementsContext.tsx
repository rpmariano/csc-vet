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

/** Comunicados lidos ficam guardados por utilizador, neste dispositivo — não há
 * tabela de "leituras" no esquema, e o inbox não pede uma para algo tão simples. */
const readStorageKey = (profileId: string) => `csc_read_announcements_${profileId}`

export const AnnouncementsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) {
      setReadIds(new Set())
      return
    }
    try {
      const raw = localStorage.getItem(readStorageKey(profile.id))
      setReadIds(new Set(raw ? (JSON.parse(raw) as string[]) : []))
    } catch {
      setReadIds(new Set())
    }
  }, [profile?.id])

  const fetchAnnouncements = useCallback(async () => {
    if (!profile) {
      setAnnouncements([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('published_at', { ascending: false })

      if (error) throw error
      const ativos = ((data as Announcement[]) || []).filter(a => a.is_active !== false)
      setAnnouncements(ativos)
    } catch (err) {
      console.error('Erro ao obter comunicados:', err)
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    fetchAnnouncements()
  }, [fetchAnnouncements])

  const isRead = useCallback((id: string) => readIds.has(id), [readIds])

  const markAsRead = useCallback((id: string) => {
    if (!profile) return
    setReadIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      try {
        localStorage.setItem(readStorageKey(profile.id), JSON.stringify(Array.from(next)))
      } catch {
        // localStorage indisponível (modo privado, quota esgotada) — a marcação fica só em memória.
      }
      return next
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
