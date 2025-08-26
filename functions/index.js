const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.grantTime = functions.https.onCall(async (data, context) => {
  if (!context.app) throw new functions.https.HttpsError("failed-precondition", "App Check requerido");
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Se requiere login");
  const uid = context.auth.uid;
  const minutes = Number(data?.minutes || 0);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24*60)
    throw new functions.https.HttpsError("invalid-argument", "minutos inválidos");

  const ref = admin.firestore().collection("users").doc(uid);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = admin.firestore.Timestamp.now().toMillis();
    const current = snap.exists ? (snap.get("timeExpiresAt")?.toMillis?.() || now) : now;
    const base = Math.max(now, current);
    const updated = base + minutes * 60_000;
    tx.set(ref, { timeExpiresAt: admin.firestore.Timestamp.fromMillis(updated),
                  updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });

  return { ok: true };
});
