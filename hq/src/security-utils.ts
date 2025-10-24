/**
 * Security utilities for Mission Control
 * Implements cryptographic operations and timing-safe comparisons
 */

/**
 * Timing-safe string comparison to prevent timing attacks
 * Uses crypto.subtle for constant-time comparison when available
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  // If lengths differ, still perform comparison to maintain constant time
  const minLength = Math.min(a.length, b.length);
  const maxLength = Math.max(a.length, b.length);
  
  // Convert to Uint8Arrays for comparison
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a.padEnd(maxLength, '\0'));
  const bBytes = encoder.encode(b.padEnd(maxLength, '\0'));
  
  // Use XOR for constant-time comparison
  let result = 0;
  for (let i = 0; i < maxLength; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  
  // Also check length difference
  result |= a.length ^ b.length;
  
  return result === 0;
}

/**
 * Generate HMAC-SHA256 signature for data
 */
export async function generateHMAC(
  key: string,
  data: string | ArrayBuffer
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  
  // Import the key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Convert data to ArrayBuffer if string
  const dataBuffer = typeof data === 'string' 
    ? encoder.encode(data)
    : data;
  
  // Generate signature
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    dataBuffer
  );
  
  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify HMAC-SHA256 signature
 */
export async function verifyHMAC(
  key: string,
  data: string | ArrayBuffer,
  signature: string
): Promise<boolean> {
  const expectedSignature = await generateHMAC(key, data);
  return timingSafeEqual(expectedSignature, signature);
}

/**
 * Generate cryptographically secure random ID
 */
export function generateSecureId(length: number = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash API key for storage (one-way hash)
 */
export async function hashAPIKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive key from password using PBKDF2
 */
export async function deriveKey(
  password: string,
  salt: string,
  iterations: number = 100000
): Promise<string> {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  const saltData = encoder.encode(salt);
  
  // Import password as key
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive bits
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltData,
      iterations,
      hash: 'SHA-256'
    },
    passwordKey,
    256 // 32 bytes
  );
  
  // Convert to hex string
  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}