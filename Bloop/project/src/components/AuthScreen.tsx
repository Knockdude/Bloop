import { useState, useMemo } from 'react';
import { Shield, Lock, Eye, EyeOff, AtSign, User, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { validatePassword } from '@/lib/crypto';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => validatePassword(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (!displayName.trim()) {
        setError('Elige un nombre de usuario.');
        return;
      }
      if (!strength.valid) {
        setError('Tu contraseña no es lo suficientemente fuerte. Revisa los requisitos.');
        return;
      }
    }

    if (!email.includes('@')) {
      setError('Introduce un email válido.');
      return;
    }

    setLoading(true);
    const result =
      mode === 'register'
        ? await signUp(email, password, displayName.trim())
        : await signIn(email, password);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e14] text-gray-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4 shadow-lg shadow-emerald-500/20">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">CipherChat</h1>
          <p className="text-gray-400 mt-2 text-sm">
            Chat cifrado de extremo a extremo. Gratis y seguro.
          </p>
        </div>

        <div className="bg-[#16161f] border border-white/5 rounded-2xl p-6 shadow-2xl">
          {/* Toggle login/register */}
          <div className="flex bg-[#0e0e14] rounded-lg p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'register'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'login'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Iniciar sesión
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Nombre de usuario</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-[#0e0e14] border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                    placeholder="Tu nombre"
                    maxLength={32}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#0e0e14] border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                  placeholder="tu@email.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0e0e14] border border-white/10 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                  placeholder={mode === 'register' ? 'Mín. 10 caracteres' : 'Tu contraseña'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Indicador de fortaleza de contraseña */}
            {mode === 'register' && password.length > 0 && (
              <div className="space-y-2 animate-fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Fortaleza</span>
                  <span className={
                    strength.score >= 5 ? 'text-emerald-400' :
                    strength.score >= 3 ? 'text-yellow-400' : 'text-red-400'
                  }>
                    {strength.label}
                  </span>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < strength.score
                          ? strength.score >= 5 ? 'bg-emerald-500' : strength.score >= 3 ? 'bg-yellow-500' : 'bg-red-500'
                          : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {strength.checks.map((c) => (
                    <div key={c.label} className="flex items-center gap-1.5 text-[11px]">
                      {c.passed ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-3 h-3 text-gray-600 flex-shrink-0" />
                      )}
                      <span className={c.passed ? 'text-gray-300' : 'text-gray-600'}>
                        {c.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 animate-fade-in">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-red-300">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : mode === 'register' ? (
                'Crear cuenta segura'
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </form>

          {mode === 'register' && (
            <div className="mt-4 flex items-start gap-2 text-[11px] text-gray-500">
              <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-emerald-500/70" />
              <span>
                Tus claves de cifrado se generan en tu navegador. Tu contraseña protege tu clave privada con
                PBKDF2 (310.000 iteraciones). Nadie, ni nosotros, puede leer tus mensajes.
              </span>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Tus mensajes están cifrados de extremo a extremo con AES-256 y RSA-2048.
        </p>
      </div>
    </div>
  );
}
