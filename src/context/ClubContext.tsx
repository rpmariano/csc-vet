import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

export interface ClubSettings {
  id: number
  name: string
  initials: string
  logo_url: string | null
  primary_color: string
  home_field_id?: string | null
}

interface ClubContextType {
  clubSettings: ClubSettings | null
  loading: boolean
  refreshSettings: () => Promise<void>
}

const ClubContext = createContext<ClubContextType | undefined>(undefined)

export const ClubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [clubSettings, setClubSettings] = useState<ClubSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const cachedHomeField = localStorage.getItem('csc_club_home_field_id')
      const { data, error } = await supabase
        .from('club_settings')
        .select('*')
        .eq('id', 1)
        .single()

      if (error) {
        if (error.code !== 'PGRST116') { // not found
          console.error('Error fetching club settings:', error.message)
        }
      } else if (data) {
        setClubSettings({
          ...data,
          home_field_id: data.home_field_id || cachedHomeField || null
        })
      }
    } catch (err) {
      console.error('Unexpected error fetching club settings:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchSettings()
    } else {
      const cachedHomeField = localStorage.getItem('csc_club_home_field_id')
      setClubSettings({
        id: 1,
        name: 'Cascais Sport Clube',
        initials: 'CSC',
        logo_url: null,
        primary_color: '#1c1c1c',
        home_field_id: cachedHomeField || null
      })
      setLoading(false)
    }
  }, [user])

  return (
    <ClubContext.Provider value={{ clubSettings, loading, refreshSettings: fetchSettings }}>
      {children}
    </ClubContext.Provider>
  )
}

export const useClub = () => {
  const context = useContext(ClubContext)
  if (context === undefined) {
    throw new Error('useClub must be used within a ClubProvider')
  }
  return context
}
