import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

const MONTH_NAMES = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function fmtMAD(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(n) + ' MAD'
}

function channelBadgeClass(channel) {
  const c = (channel || '').toLowerCase()
  if (c.includes('airbnb')) return 'badge badge-airbnb'
  if (c.includes('booking')) return 'badge badge-booking'
  return 'badge badge-direct'
}

export default function PropertyReport() {
  const { propertyId: propertyIdParam } = useParams()
  const { profile } = useAuth()
  const [property, setProperty] = useState(null)
  const [reports, setReports] = useState([])
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloadUrl, setDownloadUrl] = useState(null)

  // Resolve which property to show: explicit param (admin drill-in) or the signed-in owner's own property
  useEffect(() => {
    async function resolveProperty() {
      setLoading(true)
      let propId = propertyIdParam
      if (!propId && profile) {
        const { data } = await supabase.from('properties').select('*').eq('owner_id', profile.id).limit(1).single()
        setProperty(data || null)
        propId = data?.id
      } else if (propId) {
        const { data } = await supabase.from('properties').select('*').eq('id', propId).single()
        setProperty(data || null)
      }
      if (propId) {
        const { data: reps } = await supabase
          .from('monthly_reports')
          .select('*')
          .eq('property_id', propId)
          .order('report_year', { ascending: false })
          .order('report_month', { ascending: false })
        setReports(reps || [])
        if (reps && reps.length > 0) setSelectedReportId(reps[0].id)
        else setLoading(false)
      } else {
        setLoading(false)
      }
    }
    resolveProperty()
  }, [propertyIdParam, profile])

  useEffect(() => {
    async function loadDetail() {
      if (!selectedReportId) return
      setLoading(true)
      const [{ data: report }, { data: reservations }, { data: charges }, { data: cleanings }] = await Promise.all([
        supabase.from('monthly_reports').select('*').eq('id', selectedReportId).single(),
        supabase.from('reservations').select('*').eq('monthly_report_id', selectedReportId).order('checkin'),
        supabase.from('charges').select('*').eq('monthly_report_id', selectedReportId),
        supabase.from('cleanings').select('*').eq('monthly_report_id', selectedReportId),
      ])
      setDetail({ report, reservations: reservations || [], charges: charges || [], cleaning: cleanings?.[0] || null })
      setDownloadUrl(null)
      if (report?.original_file_path) {
        const { data } = await supabase.storage.from('monthly-reports').createSignedUrl(report.original_file_path, 300)
        setDownloadUrl(data?.signedUrl || null)
      }
      setLoading(false)
    }
    loadDetail()
  }, [selectedReportId])

  if (loading && !detail) return <div className="muted">Chargement…</div>

  if (!property) {
    return <div className="card"><p className="muted">Aucun bien n'est encore associé à ce compte. Contacte l'administrateur.</p></div>
  }

  if (reports.length === 0) {
    return (
      <div>
        <h1>{property.name}</h1>
        <div className="card" style={{ marginTop: 20 }}>
          <p className="muted">Aucun rapport mensuel n'a encore été importé pour ce bien.</p>
        </div>
      </div>
    )
  }

  const r = detail?.report
  const transferDue = r?.transfer_to_vs
  const isOwedByOwner = transferDue !== null && transferDue > 0

  return (
    <div>
      <h1>{property.name}</h1>

      <div className="month-tabs">
        {reports.map((rep) => (
          <button
            key={rep.id}
            className={rep.id === selectedReportId ? 'active' : ''}
            onClick={() => setSelectedReportId(rep.id)}
          >
            {MONTH_NAMES[rep.report_month]} {rep.report_year}
          </button>
        ))}
      </div>

      {detail && (
        <>
          <div className="card">
            <div className="card-header">
              <div>
                <h2>Récapitulatif — {MONTH_NAMES[r.report_month]} {r.report_year}</h2>
                <p>Taux d'occupation : {r.occupancy_rate ? `${Math.round(r.occupancy_rate * 100)}%` : '—'}</p>
              </div>
              {downloadUrl && (
                <a className="btn btn-secondary" href={downloadUrl} target="_blank" rel="noreferrer">
                  Télécharger le fichier Excel original
                </a>
              )}
            </div>
            <div className="stat-grid">
              <div className="stat positive">
                <div className="label">Profit propriétaire</div>
                <div className="value">{fmtMAD(r.profit_owner)}</div>
              </div>
              <div className="stat">
                <div className="label">Profit VivaStay</div>
                <div className="value">{fmtMAD(r.profit_vs)}</div>
              </div>
              <div className="stat">
                <div className="label">Charges avancées par VS</div>
                <div className="value">{fmtMAD(r.charges_advanced)}</div>
              </div>
              <div className="stat">
                <div className="label">Virement reçu (Airbnb)</div>
                <div className="value">{fmtMAD(r.airbnb_transfer_received)}</div>
              </div>
              <div className={`stat ${transferDue === null ? '' : isOwedByOwner ? 'negative' : 'positive'}`}>
                <div className="label">{isOwedByOwner ? 'À envoyer à VivaStay' : 'Dû par VivaStay au propriétaire'}</div>
                <div className="value">{fmtMAD(Math.abs(transferDue ?? NaN))}</div>
              </div>
            </div>
          </div>

          <div className="two-col">
            <div className="card">
              <div className="card-header"><h2>Réservations</h2></div>
              <table>
                <thead>
                  <tr><th>Voyageur</th><th>Arrivée</th><th>Départ</th><th>Montant</th><th>Canal</th></tr>
                </thead>
                <tbody>
                  {detail.reservations.map((res) => (
                    <tr key={res.id}>
                      <td>{res.guest_name || '—'}</td>
                      <td>{res.checkin || '—'}</td>
                      <td>{res.checkout || '—'}</td>
                      <td>{fmtMAD(res.amount)}</td>
                      <td><span className={channelBadgeClass(res.channel)}>{res.channel || '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="card">
                <div className="card-header"><h2>Charges</h2></div>
                <table>
                  <tbody>
                    {detail.charges.length === 0 && <tr><td className="muted">Aucune charge ce mois-ci</td></tr>}
                    {detail.charges.map((c) => (
                      <tr key={c.id}><td>{c.label}</td><td>{fmtMAD(c.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card">
                <div className="card-header"><h2>Ménages</h2></div>
                {detail.cleaning ? (
                  <table><tbody>
                    <tr><td>Nombre de ménages</td><td>{detail.cleaning.count ?? '—'}</td></tr>
                    <tr><td>Montant total</td><td>{fmtMAD(detail.cleaning.total_amount)}</td></tr>
                  </tbody></table>
                ) : <p className="muted">Pas de détail ménages pour ce mois.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
