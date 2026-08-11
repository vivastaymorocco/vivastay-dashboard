import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ChangePassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null); setSuccess(false)
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return }
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setError(error.message)
    else { setSuccess(true); setPassword(''); setConfirm('') }
  }

  return (
    <div>
      <h1>Changer mon mot de passe</h1>
      <div className="card" style={{ marginTop: 20, maxWidth: 420 }}>
        {error && <div className="error-banner">{error}</div>}
        {success && <div className="success-banner">Mot de passe mis à jour.</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Nouveau mot de passe</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label>Confirmer le mot de passe</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Mise à jour…' : 'Mettre à jour'}</button>
        </form>
      </div>
    </div>
  )
}
