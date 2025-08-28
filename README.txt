HTTP Conexión — Panel de Seguridad (CrisDEV)

Admin permitido: soportecrisdev@gmail.com

# CrisDEV — Panel de Seguridad (Login + Admin)

Este proyecto es un **sistema de seguridad con panel web** conectado a Firebase.  
Incluye login con **Email/Password** y **Google**, además de un diseño con fondo animado estilo *matrix*.

---

## 🚀 Funcionalidades

- **Login seguro**
  - Autenticación con Email y Contraseña.
  - Autenticación con Google (botón circular con icono oficial).
  - Solo correos autorizados pueden acceder al panel admin.
- **Diseño**
  - Fondo animado con spans verdes (`style.css`).
  - Tarjeta de login centrada con inputs estilizados.
  - Separador con línea y `"o"` para indicar inicio de sesión alternativo.
  - Botón circular blanco con icono de Google.
- **Integración con Firebase**
  - Se utiliza Firebase Authentication (Email/Password y Google).
  - Se almacena el perfil del usuario en Firestore al iniciar sesión.
  - Restricciones de acceso con lista `ALLOW` de correos permitidos.

---

## 📂 Estructura


