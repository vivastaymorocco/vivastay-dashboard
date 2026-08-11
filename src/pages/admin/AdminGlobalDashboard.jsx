import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../../lib/supabaseClient'

const MONTH_NAMES = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

function fmtMAD(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(n) + ' MAD'
}

export default function AdminGlobalDashboard() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('monthly_reports')
        .select('report_month, report_year, profit_owner, profit_vs')
        .order('report_year')
        .order('report_month')
      setRows(data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="muted">Chargement…</div>

  const byMonth = {}
  for (const r of rows) {
    const key = `${r.report_year}-${String(r.report_month).padStart(2, '0')}`
    if (!byMonth[key]) byMonth[key] = { key, month: r.report_month, year: r.report_year, net: 0 }
    byMonth[key].net += (r.profit_owner || 0) + (r.profit_vs || 0)
  }
  const chartData = Object.values(byMonth)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((r) => ({ label: `${MONTH_NAMES[r.month]} ${r.year}`, net: Math.round(r.net) }))

  const totalNet = chartData.reduce((s, r) => s + r.net, 0)

  return (
    <div>
      <h1>Vue globale</h1>
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div>
            <h2>Gain net cumulé, mois par mois</h2>
            <p>Tous propriétaires et biens confondus (profit propriétaire + profit VivaStay)</p>
          </div>
          <div className="stat positive" style={{ minWidth: 160 }}>
            <div className="label">Total sur la période</div>
            <div className="value">{fmtMAD(totalNet)}</div>
          </div>
        </div>
        {chartData.length === 0 ? (
          <p className="muted">Aucun rapport importé pour le moment.</p>
        ) : (
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => fmtMAD(v)} />
                <Bar dataKey="net" fill="var(--accent, #0F6B62)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
