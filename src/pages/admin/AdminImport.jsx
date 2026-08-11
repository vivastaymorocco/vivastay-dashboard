import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { parseReportWorkbook, toIsoDate } from '../../lib/excelParser'

const MONTH_NAMES = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const now = new Date()

function fmtMAD(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(n) + ' MAD'
}

export default function AdminImport() {
  const [properties, setProperties] = useState([])
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [matchedPropertyId, setMatchedPropertyId] = useState('')
  const [status, setStatus] = useState(null) // 'parsing' | 'ready' | 'saving' | 'done' | 'error'
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('properties').select('id, name').order('name').then(({ data }) => setProperties(data || []))
  }, [])

  async function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setError(null)
    setStatus('parsing')
    try {
      const buf = await f.arrayBuffer()
      const result = parseReportWorkbook(buf)
      setParsed(result)
      const match = properties.find(
        (p) => p.name.trim().toLowerCase() === (result.propertyName || '').trim().toLowerCase()
      )
      setMatchedPropertyId(match ? match.id : '')
      setStatus('ready')
    } catch (err) {
      setError("Impossible de lire ce fichier Excel : " + err.message)
      setStatus('error')
    }
  }

  async function handleConfirm() {
    if (!matchedPropertyId) { setError('Sélectionne le bien correspondant avant de valider.'); return }
    setStatus('saving'); setError(null)
    try {
      // 1. upsert monthly_report
      const { data: report, error: reportErr } = await supabase
        .from('monthly_reports')
        .upsert(
          {
            property_id: matchedPropertyId,
            report_month: month,
            report_year: year,
            occupancy_rate: parsed.recap.occupancy_rate,
            profit_owner: parsed.recap.profit_owner,
            profit_vs: parsed.recap.profit_vs,
            charges_advanced: parsed.recap.charges_advanced,
            airbnb_transfer_received: parsed.recap.airbnb_transfer_received,
            transfer_to_vs: parsed.recap.transfer_to_vs,
          },
          { onConflict: 'property_id,report_month,report_year' }
        )
        .select()
        .single()
      if (reportErr) throw reportErr

      // 2. clear any previous detail rows for this report (re-import safe)
      await Promise.all([
        supabase.from('reservations').delete().eq('monthly_report_id', report.id),
        supabase.from('charges').delete().eq('monthly_report_id', report.id),
        supabase.from('cleanings').delete().eq('monthly_report_id', report.id),
      ])

      // 3. insert detail rows
      if (parsed.reservations.length > 0) {
        const { error } = await supabase.from('reservations').insert(
          parsed.reservations.map((r) => ({
            monthly_report_id: report.id,
            guest_name: r.guest_name,
            checkin: toIsoDate(r.checkin),
            checkout: toIsoDate(r.checkout),
            amount: r.amount,
            channel: r.channel,
          }))
        )
        if (error) throw error
      }
      if (parsed.charges.length > 0) {
        const { error } = await supabase.from('charges').insert(
          parsed.charges.map((c) => ({ monthly_report_id: report.id, label: c.label, amount: c.amount }))
        )
        if (error) throw error
      }
      if (parsed.cleaning && (parsed.cleaning.count || parsed.cleaning.total_amount)) {
        const { error } = await supabase.from('cleanings').insert({
          monthly_report_id: report.id,
          count: parsed.cleaning.count,
          rate: parsed.cleaning.rate,
          total_amount: parsed.cleaning.total_amount,
        })
        if (error) throw error
      }

      // 4. upload original file to storage
      const path = `${matchedPropertyId}/${year}-${String(month).padStart(2, '0')}.xlsx`
      const { error: uploadErr } = await supabase.storage.from('monthly-reports').upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr
      await supabase.from('monthly_reports').update({ original_file_path: path }).eq('id', report.id)

      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('ready')
    }
  }

  function resetForm() {
    setFile(null); setParsed(null); setMatchedPropertyId(''); setStatus(null); setError(null)
  }

  return (
    <div>
      <h1>Import mensuel</h1>
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><h2>1. Mois du rapport</h2></div>
        <div className="two-col">
          <div className="field">
            <label>Mois</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Année</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>2. Fichier Excel du bien</h2></div>
        <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
      </div>

      {error && <div className="error-banner">{error}</div>}
      {status === 'parsing' && <p className="muted">Lecture du fichier…</p>}

      {parsed && status !== 'done' && (
        <div className="card">
          <div className="card-header">
            <h2>3. Aperçu avant validation</h2>
          </div>
          {parsed.errors.length > 0 && (
            <div className="error-banner">
              Certaines sections n'ont pas pu être lues automatiquement : {parsed.errors.join(' · ')}
            </div>
          )}
          <div className="field">
            <label>Bien détecté dans le fichier : « {parsed.propertyName || 'inconnu'} » — associer à :</label>
            <select value={matchedPropertyId} onChange={(e) => setMatchedPropertyId(e.target.value)}>
              <option value="">— sélectionner un bien —</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <h3 style={{ marginTop: 20, marginBottom: 8 }}>Réservations ({parsed.reservations.length})</h3>
          <table>
            <thead><tr><th>Voyageur</th><th>Arrivée</th><th>Départ</th><th>Montant</th><th>Canal</th></tr></thead>
            <tbody>
              {parsed.reservations.map((r, i) => (
                <tr key={i}><td>{r.guest_name || '—'}</td><td>{String(r.checkin || '—').slice(0,10)}</td><td>{String(r.checkout || '—').slice(0,10)}</td><td>{fmtMAD(r.amount)}</td><td>{r.channel || '—'}</td></tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 20, marginBottom: 8 }}>Charges ({parsed.charges.length})</h3>
          <table>
            <tbody>
              {parsed.charges.map((c, i) => <tr key={i}><td>{c.label}</td><td>{fmtMAD(c.amount)}</td></tr>)}
            </tbody>
          </table>

          <h3 style={{ marginTop: 20, marginBottom: 8 }}>Récap</h3>
          <div className="stat-grid">
            <div className="stat"><div className="label">Occupation</div><div className="value">{parsed.recap.occupancy_rate ? `${Math.round(parsed.recap.occupancy_rate * 100)}%` : '—'}</div></div>
            <div className="stat"><div className="label">Profit propriétaire</div><div className="value">{fmtMAD(parsed.recap.profit_owner)}</div></div>
            <div className="stat"><div className="label">Profit VS</div><div className="value">{fmtMAD(parsed.recap.profit_vs)}</div></div>
            <div className="stat"><div className="label">Charges avancées</div><div className="value">{fmtMAD(parsed.recap.charges_advanced)}</div></div>
            <div className="stat"><div className="label">Virement Airbnb reçu</div><div className="value">{fmtMAD(parsed.recap.airbnb_transfer_received)}</div></div>
            <div className="stat"><div className="label">Virement vers VS</div><div className="value">{fmtMAD(parsed.recap.transfer_to_vs)}</div></div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button className="btn" onClick={handleConfirm} disabled={status === 'saving' || !matchedPropertyId}>
              {status === 'saving' ? 'Enregistrement…' : 'Valider et importer'}
            </button>
            <button className="btn btn-secondary" onClick={resetForm}>Annuler</button>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="card">
          <div className="success-banner">Rapport importé avec succès pour « {parsed.propertyName} » — {MONTH_NAMES[month]} {year}.</div>
          <button className="btn btn-secondary" onClick={resetForm}>Importer un autre fichier</button>
        </div>
      )}
    </div>
  )
}
