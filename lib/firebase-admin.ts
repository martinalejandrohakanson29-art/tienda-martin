import admin from "firebase-admin"

function getApp() {
  if (admin.apps.length > 0) return admin.apps[0]!

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJson) return null

  try {
    const decoded = Buffer.from(serviceAccountJson, "base64").toString("utf-8")
    const serviceAccount = JSON.parse(decoded)
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
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

  const app = getApp()
  if (!app) return

  const messaging = admin.messaging(app)

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
