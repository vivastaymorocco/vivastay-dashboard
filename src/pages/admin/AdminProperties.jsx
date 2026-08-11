import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export default function AdminProperties() {
  const [owners, setOwners] = useState([])
  const [properties, setProperties] = useState([])
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(true)

  const [newOwnerEmail, setNewOwnerEmail] = useState('')
  const [newOwnerName, setNewOwnerName] = useState('')
  const [invitingOwner, setInvitingOwner] = useState(false)

  const [newPropertyName, setNewPropertyName] = useState('')
  const [newPropertyOwner, setNewPropertyOwner] = useState('')
  const [creatingProperty, setCreatingProperty] = useState(false)

  async function loadAll() {
    setLoading(true)
    const [{ data: ownersData }, { data: propsData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'owner').order('full_name'),
      supabase.from('properties').select('*, profiles(full_name, email)').order('name'),
    ])
    setOwners(ownersData || [])
    setProperties(propsData || [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function handleInviteOwner(e) {
    e.preventDefault()
    setError(null); setSuccess(null); setInvitingOwner(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session.access_token
      const res = await fetch(`https://ivrbgxkwsedorlscrruf.supabase.co/functions/v1/invite-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: newOwnerEmail, full_name: newOwnerName, redirect_to: window.location.origin }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur lors de l'invitation")
      setSuccess(`Invitation envoyée à ${newOwnerEmail}.`)
      setNewOwnerEmail(''); setNewOwnerName('')
      loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setInvitingOwner(false)
    }
  }

  async function handleCreateProperty(e) {
    e.preventDefault()
    setError(null); setSuccess(null); setCreatingProperty(true)
    const { error } = await supabase.from('properties').insert({
      name: newPropertyName.trim(),
      owner_id: newPropertyOwner || null,
    })
    setCreatingProperty(false)
    if (error) { setError(error.message); return }
    setSuccess('Bien créé.')
    setNewPropertyName(''); setNewPropertyOwner('')
    loadAll()
  }

  async function handleReassign(propertyId, ownerId) {
    setError(null)
    const { error } = await supabase.from('properties').update({ owner_id: ownerId || null }).eq('id', propertyId)
    if (error) { setError(error.message); return }
    loadAll()
  }

  if (loading) return <div className="muted">Chargement…</div>

  return (
    <div>
      <h1>Biens & propriétaires</h1>
      {error && <div className="error-banner" style={{ marginTop: 16 }}>{error}</div>}
      {success && <div className="success-banner" style={{ marginTop: 16 }}>{success}</div>}

      <div className="two-col" style={{ marginTop: 20 }}>
        <div>
          <div className="card">
            <div className="card-header">
              <h2>Biens ({properties.length})</h2>
            </div>
            <table>
              <thead><tr><th>Bien</th><th>Propriétaire</th><th></th></tr></thead>
              <tbody>
                {properties.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/bien/${p.id}`}>{p.name}</Link></td>
                    <td>
                      <select value={p.owner_id || ''} onChange={(e) => handleReassign(p.id, e.target.value)}>
                        <option value="">— non assigné —</option>
                        {owners.map((o) => (
                          <option key={o.id} value={o.id}>{o.full_name}</option>
                        ))}
                      </select>
                    </td>
                    <td><Link to={`/bien/${p.id}`} className="btn btn-secondary">Voir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-header"><h2>Ajouter un bien</h2></div>
            <form onSubmit={handleCreateProperty}>
              <div className="field">
                <label>Nom exact du bien (tel qu'il apparaît dans le fichier Excel)</label>
                <input value={newPropertyName} onChange={(e) => setNewPropertyName(e.target.value)} required />
              </div>
              <div className="field">
                <label>Propriétaire</label>
                <select value={newPropertyOwner} onChange={(e) => setNewPropertyOwner(e.target.value)}>
                  <option value="">— à assigner plus tard —</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>{o.full_name}</option>
                  ))}
                </select>
              </div>
              <button className="btn" type="submit" disabled={creatingProperty}>
                {creatingProperty ? 'Création…' : 'Créer le bien'}
              </button>
            </form>
          </div>

          <div className="card">
            <div className="card-header"><h2>Inviter un propriétaire</h2></div>
            <p className="muted" style={{ marginBottom: 12 }}>
              Le propriétaire reçoit un email pour définir son propre mot de passe.
            </p>
            <form onSubmit={handleInviteOwner}>
              <div className="field">
                <label>Nom complet</label>
                <input value={newOwnerName} onChange={(e) => setNewOwnerName(e.target.value)} required />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} required />
              </div>
              <button className="btn" type="submit" disabled={invitingOwner}>
                {invitingOwner ? 'Envoi…' : 'Envoyer l\'invitation'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
