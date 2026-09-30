import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { api, messageOf } from '../../api/client.js';
import { Field, Notice } from '../../components/UI.jsx';
export default function Profile() {
  const { user, setUser } = useAuth(); const navigate = useNavigate(); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event, type) {
    event.preventDefault(); setError(''); setSuccess(''); setBusy(true); const form = event.currentTarget; const values = new FormData(form);
    try {
      if (type === 'profile') { const r = await api.patch('/users/me', Object.fromEntries(values)); setUser(r.data.data); setSuccess('Your profile has been saved.'); }
      if (type === 'avatar') { const r = await api.post('/users/me/avatar', values); setUser(r.data.data); setSuccess('Your photo has been updated.'); }
      if (type === 'password') { await api.put('/users/me/password', Object.fromEntries(values)); setUser(null); navigate('/login'); }
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  return <section className="page"><span className="eyebrow">A SPACE THAT'S YOURS</span><h1>Your account.</h1><Notice>{error}</Notice><Notice success>{success}</Notice><div className="profile-grid"><div className="panel"><div className="profile-avatar">{user.avatarId ? <img src={`/api/assets/${user.avatarId}`} alt="Your avatar"/> : <span>{user.username.slice(0,2).toUpperCase()}</span>}<div><h2>{user.username}</h2><p className="muted">{user.email}</p></div></div><form onSubmit={e => submit(e, 'avatar')}><Field label="Profile image · PNG or JPEG, up to 2 MB" name="file" type="file" accept="image/png,image/jpeg" required/><button className="button secondary" disabled={busy}>Update photo</button></form><hr/><form onSubmit={e => submit(e, 'profile')}><Field label="Username" name="username" defaultValue={user.username} minLength={3} maxLength={30} required/><div className="form-row"><Field label="First name" name="firstName" defaultValue={user.firstName} maxLength={60}/><Field label="Last name" name="lastName" defaultValue={user.lastName} maxLength={60}/></div><button className="button" disabled={busy}>Save details</button></form></div><div className="panel"><h2>A fresh password.</h2><p className="muted">Changing your password signs you out on every device.</p><form onSubmit={e => submit(e, 'password')}><Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required/><Field label="New password · 12+ characters" name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required/><button className="button" disabled={busy}>Change password</button></form></div></div></section>;
}
