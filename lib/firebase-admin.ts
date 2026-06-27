import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app"
import { getMessaging } from "firebase-admin/messaging"

function getFirebaseApp(): App | null {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJson) return null

  if (getApps().length > 0) return getApp()

  try {
    const decoded = Buffer.from(serviceAccountJson, "base64").toString("utf-8")
    const serviceAccount = JSON.parse(decoded)
    return initializeApp({
      credential: cert(serviceAccount),
    })
  } catch {
    console.error("[firebase-admin] Error al inicializar Firebase Admin SDK")
    return null
  }
}

export async function sendPushNotification({
  tokens,
  title,
  body,
  link,
}: {
  tokens: string[]
  title: string
  body?: string
  link?: string
}) {
  if (tokens.length === 0) return

  const app = getFirebaseApp()
  if (!app) return

  const messaging = getMessaging(app)

  const messages = tokens.map(token => ({
    token,
    notification: { title, body: body ?? undefined },
    data: link ? { link } : undefined,
    android: {
      priority: "high" as const,
      notification: { sound: "default" },
    },
  }))

  try {
    const result = await messaging.sendEach(messages)
    if (result.failureCount > 0) {
      result.responses.forEach((r, i) => {
        if (!r.success) {
          console.error(`[FCM] Token ${tokens[i]} falló:`, r.error?.message)
        }
      })
    }
  } catch (error) {
    console.error("[FCM] Error enviando notificaciones:", error)
  }
}
