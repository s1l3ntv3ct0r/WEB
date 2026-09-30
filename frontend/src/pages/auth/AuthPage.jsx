import { useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { api, messageOf } from '../../api/client.js';
import { Field, Notice } from '../../components/UI.jsx';
export default function AuthPage({ mode }) {
  const [captcha, setCaptcha] = useState(null); const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false);
  const { signIn } = useAuth(); const navigate = useNavigate(); const location = useLocation(); const [params] = useSearchParams();
  const register = mode === 'register'; const forgot = mode === 'forgot-password'; const reset = mode === 'reset-password';
  const title = register ? 'Make yourself at home.' : forgot ? 'A fresh start.' : reset ? 'Your new password.' : 'Good to see you again.';
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === 'login' && captcha) { values.captchaId = captcha.id; values.captchaAnswer = captchaAnswer; }
      if (forgot || reset) { const { data } = await api.post(`/auth/${mode}`, reset ? { token: params.get('token') || '', password: values.password } : { email: values.email }); setSuccess(data.data.message); }
      else { await signIn(mode, values); navigate(location.state?.from || '/products'); }
    } catch (e) { setError(messageOf(e)); if (mode === 'login' && e.response?.status === 401) { setCaptcha(e.response.data.captcha || null); setCaptchaAnswer(''); } } finally { setBusy(false); }
  }
  async function refreshCaptcha(event) {
    const email = event.currentTarget.form.elements.email.value;
    setBusy(true); setError('');
    try { const { data } = await api.post('/auth/login-captcha', { email }); setCaptcha(data.data.captcha); setCaptchaAnswer(''); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  return <section className="auth-shell" key={mode}><div className="auth-story"><span className="eyebrow">YOUR EVERYDAY, REIMAGINED</span><h1>Small things.<br/>Better days.</h1><p>A considered collection for the spaces you work, the places you go, and everything in between.</p><div className="auth-orbit"><span>sl.</span></div></div><div className="auth-form"><span className="eyebrow">SHOPLAB ACCOUNT</span><h2>{title}</h2><p>{register ? 'Create an account to manage your orders and delivery details.' : 'Your collection is waiting for you.'}</p><form key={mode} onSubmit={submit}><Notice>{error}</Notice><Notice success>{success}</Notice>{register && <Field label="Username" name="username" required minLength={3} maxLength={30} pattern="[a-z0-9_]+" autoComplete="username"/>}{!reset && <Field label="Email address" name="email" type="email" required autoComplete="email"/>}{!forgot && <Field label={reset ? 'New password (12+ characters)' : 'Password'} name="password" type="password" required minLength={register || reset ? 12 : 1} maxLength={72} autoComplete={register || reset ? 'new-password' : 'current-password'}/>}{!forgot && !register && !reset && <Link className="small-link" to="/forgot-password">Forgot your password?</Link>}{mode === 'login' && captcha && <div className="login-captcha"><p role="status">For your security, complete the CAPTCHA to continue.</p><img src={captcha.image} width="240" height="76" alt="CAPTCHA verification characters"/><button type="button" className="small-link" disabled={busy} onClick={refreshCaptcha}>Get a new code</button><Field label="Characters in the image (not case-sensitive)" name="captchaAnswer" value={captchaAnswer} onChange={event => setCaptchaAnswer(event.target.value)} required maxLength={6} autoComplete="off" spellCheck={false}/></div>}<button className="button full" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account →' : forgot ? 'Send reset link →' : reset ? 'Update password →' : 'Sign in →'}</button></form><p className="auth-switch">{register || forgot || reset ? <Link to="/login">Back to sign in</Link> : <>New around here? <Link to="/register">Create an account</Link></>}</p></div></section>;
}
