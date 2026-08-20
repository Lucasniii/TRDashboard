// server-only: OAuth refresh tokens are encrypted before they reach the database.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function key(): Buffer {
  const value = process.env.TRDASHBOARD_TOKEN_ENCRYPTION_KEY?.trim() ?? ''
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== 32) throw new Error('Die Token-Verschlüsselung ist nicht eingerichtet.')
  return decoded
}

export function encryptTokenPayload(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decryptTokenPayload<T>(value: string): T {
  const payload = Buffer.from(value, 'base64url')
  if (payload.length < 29) throw new Error('Gespeicherte Zugangsdaten sind ungültig.')
  const decipher = createDecipheriv('aes-256-gcm', key(), payload.subarray(0, 12))
  decipher.setAuthTag(payload.subarray(12, 28))
  const decoded = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8')
  return JSON.parse(decoded) as T
}
