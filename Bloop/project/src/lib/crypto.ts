/**
 * Cifrado de extremo a extremo (E2EE) usando Web Crypto API.
 *
 * Flujo:
 * - Cada usuario genera un par de claves RSA-OAEP (2048 bits) al registrarse.
 * - La clave privada RSA se cifra con AES-GCM usando una clave derivada de la
 *   contraseña del usuario mediante PBKDF2 (310000 iteraciones).
 * - Cada canal genera una clave AES-GCM-256 simétrica compartida.
 * - Esa clave AES se cifra con la clave pública RSA de cada miembro y se guarda
 *   en channel_keys. Solo el miembro con su clave privada puede descifrarla.
 * - Los mensajes se cifran con AES-GCM-256 usando la clave del canal.
 *
 * El servidor (Supabase) NUNCA ve el texto plano ni las claves simétricas.
 */

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

const PBKDF2_ITERATIONS = 310000;

// ---------- helpers base64 ----------

export function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------- generación de claves RSA ----------

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(RSA_PARAMS, true, ['encrypt', 'decrypt']);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', key);
  return bufferToBase64(exported);
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('pkcs8', key);
  return bufferToBase64(exported);
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const buf = base64ToBuffer(b64);
  return crypto.subtle.importKey('spki', buf, RSA_PARAMS, false, ['encrypt']);
}

export async function importPrivateKey(keyData: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', keyData, RSA_PARAMS, false, ['decrypt']);
}

// ---------- derivación de clave desde contraseña (PBKDF2) ----------

export function generateSalt(): string {
  const arr = crypto.getRandomValues(new Uint8Array(32));
  return bufferToBase64(arr);
}

async function deriveKeyFromPassword(password: string, saltB64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBuffer(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------- cifrar/descifrar la clave privada RSA con la contraseña ----------

export async function encryptPrivateKey(
  privateKey: CryptoKey,
  password: string,
  saltB64: string,
): Promise<string> {
  const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
  const aesKey = await deriveKeyFromPassword(password, saltB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    exported,
  );
  return `${bufferToBase64(iv)}:${bufferToBase64(encrypted)}`;
}

export async function decryptPrivateKey(
  encryptedPrivateKey: string,
  password: string,
  saltB64: string,
): Promise<CryptoKey> {
  const [ivB64, dataB64] = encryptedPrivateKey.split(':');
  const aesKey = await deriveKeyFromPassword(password, saltB64);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(ivB64) },
    aesKey,
    base64ToBuffer(dataB64),
  );
  return importPrivateKey(decrypted);
}

// ---------- claves simétricas de canal (AES-GCM-256) ----------

export async function generateChannelKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportChannelKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufferToBase64(raw);
}

export async function importChannelKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBuffer(b64), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

// ---------- cifrar clave de canal con la clave pública RSA de un miembro ----------

export async function encryptChannelKeyForUser(
  channelKey: CryptoKey,
  recipientPublicKeyB64: string,
): Promise<string> {
  const pubKey = await importPublicKey(recipientPublicKeyB64);
  const rawKey = await crypto.subtle.exportKey('raw', channelKey);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, rawKey);
  return bufferToBase64(encrypted);
}

export async function decryptChannelKey(
  encryptedKeyB64: string,
  privateKey: CryptoKey,
): Promise<CryptoKey> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    base64ToBuffer(encryptedKeyB64),
  );
  return crypto.subtle.importKey('raw', decrypted, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

// ---------- cifrar/descifrar mensajes ----------

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

export async function encryptMessage(plaintext: string, key: CryptoKey): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
  };
}

export async function decryptMessage(
  ciphertextB64: string,
  ivB64: string,
  key: CryptoKey,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(ivB64) },
    key,
    base64ToBuffer(ciphertextB64),
  );
  return new TextDecoder().decode(decrypted);
}

// ---------- validación de contraseña fuerte ----------

export interface PasswordStrength {
  score: number;
  label: string;
  checks: { label: string; passed: boolean }[];
  valid: boolean;
}

export function validatePassword(password: string): PasswordStrength {
  const checks = [
    { label: 'Mínimo 10 caracteres', passed: password.length >= 10 },
    { label: 'Una mayúscula (A-Z)', passed: /[A-Z]/.test(password) },
    { label: 'Una minúscula (a-z)', passed: /[a-z]/.test(password) },
    { label: 'Un número (0-9)', passed: /\d/.test(password) },
    { label: 'Un carácter especial (!@#$…)', passed: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password) },
    { label: 'Sin espacios', passed: !/\s/.test(password) && password.length > 0 },
  ];
  const passedCount = checks.filter((c) => c.passed).length;
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Muy buena', 'Fuerte', 'Muy fuerte'];
  const valid = passedCount === checks.length;
  return {
    score: passedCount,
    label: labels[passedCount],
    checks,
    valid,
  };
}
