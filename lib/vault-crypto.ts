import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
    const raw = process.env.VAULT_ENCRYPTION_KEY
    if (!raw) {
        throw new Error("VAULT_ENCRYPTION_KEY no está configurada")
    }
    const key = Buffer.from(raw, "base64")
    if (key.length !== 32) {
        throw new Error("VAULT_ENCRYPTION_KEY debe decodificar a 32 bytes (base64)")
    }
    return key
}

export function encryptSecret(plaintext: string): string {
    const key = getKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    const authTag = cipher.getAuthTag()
    return Buffer.concat([iv, authTag, ciphertext]).toString("base64")
}

export function decryptSecret(payload: string): string {
    const key = getKey()
    const buf = Buffer.from(payload, "base64")
    const iv = buf.subarray(0, IV_LENGTH)
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return plaintext.toString("utf8")
}
