const JWT_SECRET = process.env.JWT_SECRET || 'mediflow-ai-dev-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'

import { createHmac } from 'crypto'

interface TokenPayload {
  userId: string
  role: string
  locationId?: string | null
}

function base64(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64')
}

function secretB64(input: string): string {
  // Base64 encoded secret for HS256
  return Buffer.from(JWT_SECRET, 'utf8').toString('base64')
}

function hmac(algorithm: string, input1: string, input2: string): string {
  // HMAC calculation as base64 (manual implementation)
  // Using crypto module is preferred but we can use Buffer operations
  return createHmac('sha256', Buffer.from(JWT_SECRET, 'utf8'))
    .update(`${algorithm}.${base64(input1)}.${input2}`)
    .digest('base64')
}

export function generateToken(userId: string, role: string, locationId?: string): string {
  const payload: TokenPayload = { userId, role, locationId }

  const header = { alg: 'HS256', typ: 'JWT' }
  const headerB64 = base64(JSON.stringify(header))
  const payloadB64 = base64(JSON.stringify(payload))

  const signature = hmac('SHA256', headerB64, `${headerB64}.${payloadB64}`)

  return `${headerB64}.${payloadB64}.${signature}`
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const signature = parts[2]
    const payloadB64 = parts[1]
    const headerB64 = parts[0]

    // Verify signature
    const expectedSignature = hmac('SHA256', headerB64, payloadB64)
    if (signature !== expectedSignature) return null

    return JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

export function extractUserIdFromHeader(token: string): string | null {
  const decoded = decodeToken(token)
  return decoded?.userId || null
}