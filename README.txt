HTTP Conexión — Panel de Seguridad (CrisDEV)

Admin permitido: soportecrisdev@gmail.com

PASOS:
1) Firebase Console:
   - Authentication → Sign-in method → habilita Google (panel) y Anonymous (Android).
   - Firestore → Create database (Production).
   - Configuración del proyecto → Tus apps → Web → copia firebaseConfig.
   - Authentication → Settings → Authorized domains → agrega el dominio del panel.

2) Edita index.html y pega firebaseConfig. Ya trae ALLOW con elcris1823@gmail.com.

3) Sube reglas Firestore: firebase deploy --only firestore:rules

4) Hosting:
   - firebase init hosting (elige el proyecto)
   - copia index.html a la carpeta pública
   - firebase deploy --only hosting

5) Crea doc config/global en Firestore con campos:
   enabled: true
   minVersion: "3.0.45"
   latestVersion: "3.0.45"
   encKey: "TU_LLAVE_O_BASE64"
   encKeyVersion: 1
   sigSha256: "HUELLA_SHA256_APK" (opcional)
   ads.links: [ {name:"Promo 1", url:"https://tulink"} ]

Este panel controla seguridad de la app antes del Main (versión mínima, kill-switch, claves y links).
