import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

const TokenPayloadSchema = z.object({
  sub: z.string(),
  iat: z.number(),
  exp: z.number(),
  scope: z.string().optional(),
});

export type TokenPayload = z.infer<typeof TokenPayloadSchema>;

export interface AuthEnv {
  JWT_SECRET: string;
  API_KEY_SECRET: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function verifyJWT(token: string, secret: string): Promise<TokenPayload> {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey);
    return TokenPayloadSchema.parse(payload);
  } catch (error) {
    throw new AuthError('Invalid or expired JWT token');
  }
}

export async function generateJWT(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: string = '24h'
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  
  const expirationMs = parseExpiration(expiresIn);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + Math.floor(expirationMs / 1000);
  
  return new SignJWT({ ...payload, iat, exp })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(secretKey);
}

function parseExpiration(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error('Invalid expiration format');
  
  const [, value, unit] = match;
  const num = parseInt(value, 10);
  
  switch (unit) {
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'd': return num * 24 * 60 * 60 * 1000;
    default: throw new Error('Invalid expiration unit');
  }
}

export function verifyAPIKey(key: string, secret: string): boolean {
  return key === secret;
}

export async function authMiddleware(
  request: Request,
  env: AuthEnv
): Promise<TokenPayload | null> {
  const authHeader = request.headers.get('Authorization');
  const apiKey = request.headers.get('X-API-Key');
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return await verifyJWT(token, env.JWT_SECRET);
  }
  
  if (apiKey) {
    if (!verifyAPIKey(apiKey, env.API_KEY_SECRET)) {
      throw new AuthError('Invalid API key');
    }
    return {
      sub: 'api-key-user',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      scope: 'api',
    };
  }
  
  throw new AuthError('Missing authentication credentials');
}