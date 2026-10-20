import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Profile } from './supabase';
import {
  generateKeyPair,
  exportPublicKey,
  encryptPrivateKey,
  generateSalt,
  decryptPrivateKey,
} from './crypto';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  privateKey: CryptoKey | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (currentUser: User, password?: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (error) {
      console.error('Error loading profile:', error);
      return null;
    }
    if (data) {
      setProfile(data as Profile);
      if (password) {
        try {
          const pk = await decryptPrivateKey(
            (data as Profile).encrypted_private_key,
            password,
            (data as Profile).salt,
          );
          setPrivateKey(pk);
          sessionStorage.setItem('cipher_password', password);
        } catch {
          // contraseña incorrecta para descifrar
        }
      } else {
        const stored = sessionStorage.getItem('cipher_password');
        if (stored) {
          try {
            const pk = await decryptPrivateKey(
              (data as Profile).encrypted_private_key,
              stored,
              (data as Profile).salt,
            );
            setPrivateKey(pk);
          } catch {
            sessionStorage.removeItem('cipher_password');
          }
        }
      }
    }
    return data as Profile | null;
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfile(data.session.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        if (!mounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await loadProfile(newSession.user);
        } else {
          setProfile(null);
          setPrivateKey(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return { error: translateError(error.message) };
        if (!data.user) return { error: 'No se pudo crear la cuenta.' };

        // Generar par de claves RSA
        const keyPair = await generateKeyPair();
        const pubB64 = await exportPublicKey(keyPair.publicKey);
        const salt = generateSalt();
        const encPriv = await encryptPrivateKey(keyPair.privateKey, password, salt);

        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          display_name: displayName,
          public_key: pubB64,
          encrypted_private_key: encPriv,
          salt,
        });

        if (profileError) {
          return { error: 'Error al crear el perfil: ' + profileError.message };
        }

        // Cargar perfil y clave privada en memoria
        await loadProfile(data.user, password);
        return { error: null };
      } catch {
        return { error: 'Error inesperado al registrarse.' };
      }
    },
    [loadProfile],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: translateError(error.message) };
        if (!data.user) return { error: 'No se pudo iniciar sesión.' };

        await loadProfile(data.user, password);
        return { error: null };
      } catch {
        return { error: 'Error inesperado al iniciar sesión.' };
      }
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    sessionStorage.removeItem('cipher_password');
    setPrivateKey(null);
    setProfile(null);
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user);
  }, [user, loadProfile]);

  return (
    <AuthContext.Provider
      value={{ session, user, profile, privateKey, loading, signUp, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

function translateError(msg: string): string {
  if (msg.includes('Invalid login')) return 'Email o contraseña incorrectos.';
  if (msg.includes('already registered')) return 'Ya existe una cuenta con este email.';
  if (msg.includes('Password should be')) return 'La contraseña no cumple los requisitos mínimos.';
  if (msg.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos.';
  return msg;
}
