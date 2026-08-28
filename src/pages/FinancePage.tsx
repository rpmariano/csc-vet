import React, { useEffect, useState } from 'react'
import { Landmark, TrendingUp, TrendingDown, DollarSign, Plus, Check } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

interface Transaction {
  id: string
  type: 'income' | 'expense'
  amount: number
  description: string
  date: string
}

interface PlayerDue {
  id: string
  name: string
  month_year: string
  amount: number
  status: 'pending' | 'paid' | 'late'
}

const FinancePage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [dues, setDues] = useState<PlayerDue[]>([])
  const [loading, setLoading] = useState(true)

  // Transaction form state
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<'income' | 'expense'>('income')

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: transData } = await supabase.from('transactions').select('*').order('date', { ascending: false })
      const { data: duesData } = await supabase.from('dues').select('*, profiles(name)')

      if (transData && transData.length > 0) {
        setTransactions(transData as Transaction[])
      } else {
        setTransactions([
          { id: 't1', type: 'income', amount: 350.00, description: 'Patrocínio Pastelaria Central', date: '2026-08-20' },
          { id: 't2', type: 'expense', amount: 120.00, description: 'Aluguer de Campo - Agosto', date: '2026-08-15' },
          { id: 't3', type: 'expense', amount: 80.00, description: 'Compra de Bolas Novas', date: '2026-08-10' }
        ])
      }

      if (duesData && duesData.length > 0) {
        // Map profiles.name
        const mapped = duesData.map((d: any) => ({
          id: d.id,
          name: d.profiles?.name || 'Jogador',
          month_year: d.month_year,
          amount: d.amount,
          status: d.status
        }))
        setDues(mapped as PlayerDue[])
      } else {
        setDues([
          { id: 'd1', name: 'Rui Costa', month_year: '2026-08', amount: 15.00, status: 'paid' },
          { id: 'd2', name: 'João Pinto', month_year: '2026-08', amount: 15.00, status: 'late' },
          { id: 'd3', name: 'Manuel Bento', month_year: '2026-08', amount: 15.00, status: 'pending' },
          { id: 'd4', name: 'Vítor Paneira', month_year: '2026-08', amount: 15.00, status: 'paid' }
        ])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(amount)
    if (isNaN(val) || val <= 0) return

    try {
      const newTrans = {
        type,
        amount: val,
        description: desc,
        date: new Date().toISOString().split('T')[0]
      }
      const { error } = await supabase.from('transactions').insert([newTrans])
      if (error) throw error
      fetchData()
      setDesc('')
      setAmount('')
    } catch (err) {
      // offline simulation
      const localTrans: Transaction = {
        id: Math.random().toString(),
        type,
        amount: val,
        description: desc,
        date: new Date().toISOString().split('T')[0]
      }
      setTransactions(prev => [localTrans, ...prev])
      setDesc('')
      setAmount('')
    }
  }

  const markAsPaid = async (dueId: string) => {
    try {
      const { error } = await supabase.from('dues').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', dueId)
      if (error) throw error
      setDues(prev => prev.map(d => (d.id === dueId ? { ...d, status: 'paid' } : d)))
    } catch (err) {
      setDues(prev => prev.map(d => (d.id === dueId ? { ...d, status: 'paid' } : d)))
    }
  }

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, c) => acc + c.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, c) => acc + c.amount, 0)
  const netBalance = totalIncome - totalExpense

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-csc-dark">Gestão Financeira</h1>
        <p className="text-gray-550 mt-1">Monitore o balanço e registe o pagamento de quotas dos atletas.</p>
      </div>

      {/* Cartões de Balanço */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-500">Saldo Disponível</p>
            <p className="text-2xl font-black text-csc-dark mt-1">{netBalance.toFixed(2)}€</p>
          </div>
          <div className="w-12 h-12 bg-gray-50 text-csc-dark rounded-full flex items-center justify-center">
            <Landmark size={24} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-500">Total Receitas</p>
            <p className="text-2xl font-black text-green-700 mt-1">+{totalIncome.toFixed(2)}€</p>
          </div>
          <div className="w-12 h-12 bg-green-50 text-green-700 rounded-full flex items-center justify-center">
            <TrendingUp size={24} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-500">Total Despesas</p>
            <p className="text-2xl font-black text-red-700 mt-1">-{totalExpense.toFixed(2)}€</p>
          </div>
          <div className="w-12 h-12 bg-red-50 text-red-700 rounded-full flex items-center justify-center">
            <TrendingDown size={24} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Adicionar Movimento e Registo Dues */}
        <div className="space-y-6 h-fit">
          <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
            <h3 className="text-lg font-bold text-gray-805 mb-4 flex items-center space-x-2">
              <DollarSign size={20} className="text-csc-dark" />
              <span>Registar Movimento</span>
            </h3>
            
            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-705 mb-1">Descrição</label>
                <input
                  type="text"
                  required
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                  placeholder="Ex: Pagamento Árbitro"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-705 mb-1">Valor (€)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-705 mb-1">Tipo</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                >
                  <option value="income">Receita (Entrada)</option>
                  <option value="expense">Despesa (Saída)</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center space-x-2 bg-csc-dark text-white py-2 rounded-lg font-bold hover:bg-csc-dark/80 transition-colors shadow"
              >
                <Plus size={18} />
                <span>Registar</span>
              </button>
            </form>
          </div>
        </div>

        {/* Tabelas de Quotas e Transações */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabela de Controlo de Quotas */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
            <h3 className="text-lg font-bold text-gray-805 mb-4">Controlo de Quotas (Jogadores)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                    <th className="px-4 py-2">Jogador</th>
                    <th className="px-4 py-2">Mês</th>
                    <th className="px-4 py-2">Valor</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dues.map((due) => (
                    <tr key={due.id}>
                      <td className="px-4 py-3 font-semibold text-gray-800">{due.name}</td>
                      <td className="px-4 py-3 text-gray-550">{due.month_year}</td>
                      <td className="px-4 py-3 text-gray-800">{due.amount.toFixed(2)}€</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${due.status === 'paid' ? 'bg-green-100 text-green-800' : due.status === 'late' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {due.status === 'paid' ? 'Pago' : due.status === 'late' ? 'Atraso' : 'Pendente'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {due.status !== 'paid' && (
                          <button
                            onClick={() => markAsPaid(due.id)}
                            className="bg-green-600 hover:bg-green-700 text-white p-1 rounded transition-colors inline-flex items-center space-x-1 text-xs"
                            title="Marcar como Pago"
                          >
                            <Check size={14} />
                            <span>Pago</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Últimos Movimentos */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
            <h3 className="text-lg font-bold text-gray-805 mb-4">Últimos Movimentos</h3>
            <div className="space-y-3">
              {transactions.map((t) => (
                <div key={t.id} className="flex justify-between items-center p-3 rounded-lg bg-gray-50">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{t.description}</p>
                    <p className="text-[10px] text-gray-400">{t.date}</p>
                  </div>
                  <p className={`font-bold text-sm ${t.type === 'income' ? 'text-green-700' : 'text-red-700'}`}>
                    {t.type === 'income' ? '+' : '-'}{t.amount.toFixed(2)}€
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FinancePage
