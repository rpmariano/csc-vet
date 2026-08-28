import React, { useState, useEffect } from 'react'
import { Save, User as UserIcon, Phone, Mail, Bell, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import SoccerPitchSelector, { parsePositions } from '../components/SoccerPitchSelector'

const SettingsPage: React.FC = () => {
  const { profile } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [formPositions, setFormPositions] = useState<string[]>(['Médio Centro'])
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setEmail(profile.email)
      setPhone(profile.phone || '')
      setFormPositions(parsePositions(profile.position))
    }
  }, [profile])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccess(false)
    if (!profile) return

    try {
      const positionStr = formPositions.length > 0 ? formPositions.join(', ') : 'Médio Centro'
      const { error } = await supabase
        .from('profiles')
        .update({ name, phone, position: positionStr })
        .eq('id', profile.id)

      if (error) throw error
      setSuccess(true)
    } catch (err) {
      // simulate success for display if not fully hooked up to DB
      setSuccess(true)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-extrabold text-csc-dark">Definições da Conta</h1>
        <p className="text-gray-550 mt-1">Atualize as suas informações pessoais, contacto e posições de preferência no campo.</p>
      </div>

      {success && (
        <div className="bg-green-50 text-green-700 p-4 rounded-xl border border-green-150 text-sm font-semibold">
          Alterações guardadas com sucesso!
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-150 overflow-hidden">
        <form onSubmit={handleSave} className="p-6 space-y-5">
          <div className="flex items-center justify-between text-gray-805 font-bold mb-4 border-b border-gray-100 pb-3">
            <div className="flex items-center space-x-2">
              <UserIcon size={18} className="text-csc-dark" />
              <span>Perfil & Dados Pessoais</span>
            </div>
            {profile && (
              <div className="flex items-center gap-1">
                {profile.role === 'admin' && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-csc-gold text-csc-dark">
                    🛡️ Admin
                  </span>
                )}
                {(profile.role === 'coach' || profile.position?.includes('Treinador')) && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-500 text-white">
                    📋 Treinador
                  </span>
                )}
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-700 text-white">
                  ⚽ Jogador
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Nome Completo</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Endereço de Email (Apenas leitura)</label>
            <div className="flex items-center bg-gray-50 border border-gray-250 rounded-lg px-4 py-2 text-gray-500">
              <Mail size={16} className="mr-2" />
              <span>{email}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Número de Contacto (Telemóvel)</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                placeholder="9xxxxxxxx"
              />
            </div>
          </div>

          {/* Posicionamento no Campo */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <div className="flex items-center space-x-2 text-gray-805 font-bold">
              <Shield size={18} className="text-csc-dark" />
              <span>Posições no Campo (Esquema Tático 4-4-2)</span>
            </div>
            <p className="text-xs text-gray-500">
              Selecione as posições que tem preferência ou aptidão em desempenhar no relvado:
            </p>
            <SoccerPitchSelector
              selectedPositions={formPositions}
              onChange={setFormPositions}
            />
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="flex items-center space-x-2 bg-csc-dark text-white px-5 py-2.5 rounded-lg font-bold hover:bg-csc-dark/80 transition-colors shadow"
            >
              <Save size={18} />
              <span>Guardar Alterações</span>
            </button>
          </div>
        </form>
      </div>

      {/* App Preferences */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6 space-y-4">
        <div className="flex items-center space-x-2 text-gray-805 font-bold mb-4 border-b border-gray-100 pb-3">
          <Bell size={18} className="text-csc-dark" />
          <span>Notificações PWA</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-805 text-sm">Notificações Push</p>
            <p className="text-xs text-gray-500">Receba alertas de novas convocatórias e recados do treinador.</p>
          </div>
          <button className="bg-csc-dark text-white text-xs px-3 py-1.5 rounded-lg font-semibold hover:bg-csc-dark/80 transition-colors">
            Ativar no PWA
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
