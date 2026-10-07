# Sushi Poke — Guía de subida a producción (Vercel + Supabase)

## Estructura de archivos entregados

```
/ (raíz, junto a index.html y main.css)
├── 404.html                 → página de error personalizada (Vercel la usa automáticamente)
├── privacidad.html          → Política de Privacidad
├── cookies.html             → Política de Cookies
├── terminos.html            → Términos y Condiciones
├── recuperar.html           → solicitar enlace de recuperación de clave
├── restablecer.html         → establecer nueva contraseña (destino del email)
├── vercel.json              → headers de seguridad + cleanUrls
├── js/
│   ├── supabase-config.js   → ⚠️ pegar URL y anon key
│   ├── auth.js              → login, registro, sesión única, recuperación
│   └── orders.js            → registrar pedido en BD antes de WhatsApp (opcional)
└── supabase/
    ├── 01_schema.sql        → tablas, RLS, funciones, auditoría
    └── 02_seed.sql          → productos, promos y configuración iniciales
```

---

## PASO 1 — Base de datos (Supabase) · 15 min

1. Crear proyecto en https://supabase.com (plan gratis es suficiente para arrancar).
2. **SQL Editor → New query →** pegar y ejecutar `supabase/01_schema.sql`.
3. Repetir con `supabase/02_seed.sql`.
4. **Project Settings → API:** copiar `Project URL` y `anon public key` en `js/supabase-config.js`.
5. Crear el primer admin (después de registrarte en la web):
   ```sql
   update public.profiles set role = 'admin' where phone = '+584243678252';
   ```

**Tablas creadas:** `profiles` (usuario), `addresses`, `orders` (pedidos), `order_items`,
`products`, `promotions`, `active_sessions` (anti duplicado), `audit_logs` (auditoría) y
`site_settings` (tasa BCV, tarifa de delivery). Toda la seguridad está activada con
Row Level Security: cada usuario solo ve sus propios datos.

## PASO 2 — Configurar Auth (login + recuperación) · 10 min

En **Authentication → Providers**: dejar activo solo **Email**.

En **Authentication → Sign In / Providers → Email**:
- ✅ Activar **"Confirm email"** (los registrados validan su correo; requisito para que la
  recuperación de clave sea confiable).
- En **Authentication → URL Configuration**:
  - Site URL: `https://tudominio.com`
  - Redirect URLs: añadir `https://tudominio.com/restablecer.html` y `http://localhost:5500/restablecer.html`
- En **Authentication → Email Templates → "Reset Password"**: personalizar el correo
  (firma Sushi Poke, color #c41e3a). El botón ya lleva el enlace con el token.
- **SMTP (importante para producción):** en Project Settings → Auth → SMTP, conectar un
  servicio (Resend, SendGrid o Brevo). El SMTP por defecto de Supabase tiene límite de 4
  correos/hora — con tu propio SMTP no tendrás ese cuello de botella el sábado.
- Opcional pero recomendado: **Authentication → Attack Protection → Captcha** (hCaptcha o
  Turnstile, gratis) para frenar bots en registro/login.

## PASO 3 — Integrar en el index.html · 10 min

1. Antes de `</body>` (después del `<script>` actual), añadir:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="js/supabase-config.js"></script>
<script src="js/auth.js"></script>
<script src="js/orders.js"></script>   <!-- opcional: pedidos en BD -->
```

2. `auth.js` sobrescribe `handleLogin` y `handleRegister` automáticamente — no hay que
   tocar los formularios existentes. El icono de usuario se convierte en avatar con tu
   inicial y menú de "Cerrar sesión" cuando hay sesión.

3. Añadir el enlace de "¿Olvidaste tu contraseña?" dentro del formulario del `loginModal`:

```html
<p style="text-align:right;margin:-8px 0 6px">
  <a href="#" style="color:var(--primary);font-size:.85rem;font-weight:600;text-decoration:none"
     onclick="closeModal('loginModal');openModal('recoveryModal');return false;">
     ¿Olvidaste tu contraseña?</a>
</p>
```

4. Añadir el modal de recuperación (junto a los otros modales):

```html
<div class="modal-overlay" id="recoveryModal" onclick="closeModalOnOverlay(event,'recoveryModal')">
  <div class="modal">
    <button class="close-modal" onclick="closeModal('recoveryModal')"><i class="fas fa-times"></i></button>
    <h2>Recuperar contraseña</h2>
    <p class="subtitle">Te enviaremos un enlace a tu correo</p>
    <form onsubmit="handleRecoveryRequest(event)">
      <div class="form-group">
        <label>Correo electrónico</label>
        <input type="email" placeholder="tu@email.com" required>
      </div>
      <button type="submit" class="btn btn-primary">Enviar enlace</button>
    </form>
  </div>
</div>
```

5. (Opcional) Para registrar pedidos en la BD: cambiar en el carrito
   `onclick="checkout()"` por `onclick="checkoutWithDB()"`. Los usuarios con sesión
   generan un número de pedido `SP-AAAAMMDD-0001`; los invitados siguen por WhatsApp directo.

6. Al final de `main.css`, pegar el bloque de avatar que está en `css_snippets.txt`.

7. En el footer, enlazar las páginas legales:

```html
<li><a href="/privacidad">Política de Privacidad</a></li>
<li><a href="/cookies">Política de Cookies</a></li>
<li><a href="/terminos">Términos y Condiciones</a></li>
```

## PASO 4 — Deploy en Vercel · 5 min

1. Subir todo a un repo de GitHub y "Add New → Project" en vercel.com (framework: **Other**,
   sin build command — es sitio estático). O usar la CLI: `vercel --prod`.
2. `vercel.json` ya incluye: HTTPS forzado (HSTS), `nosniff`, anti-clickjacking,
   Permissions-Policy, CSP, y `404.html` se sirve automáticamente en rutas inexistentes.
3. Conectar el dominio (o usar el `*.vercel.app` provisorio) y añadir ese dominio en
   Supabase → Auth → URL Configuration.

## Cómo funciona la seguridad

| Medida | Implementación |
|---|---|
| Sesión única (anti duplicado) | `register_session()` desactiva sesiones previas del mismo usuario; `validate_session()` expulsa al navegador antiguo (revisa cada 5 min y al volver a la pestaña) |
| Recuperación de clave | Supabase Auth + flujo en `recuperar.html` / `restablecer.html`; mensajes genéricos anti-enumeración; la sesión de recuperación se cierra y pide login con la nueva clave |
| Contraseñas | Nunca se guardan en tu BD (bcrypt por Supabase Auth); validación mínima 8 caracteres alfanumérica |
| Datos protegidos | RLS en las 9 tablas: cada usuario solo ve/edita lo suyo; escritura admin solo para catálogo/config |
| Auditoría | Bitácora de inicios de sesión, pedidos y cambios de estado |
| Transporte/sitio | TLS (Vercel), headers de seguridad en vercel.json |
| Anti-fraude básico | Rate limiting nativo de Supabase Auth + captcha opcional + sesión única |

**Nota (fase 2):** `create_order` recibe precios desde el cliente; para hardening total se
pueden validar contra `public.products` en el servidor. Para el lanzamiento es aceptable
porque la confirmación real siempre ocurre por WhatsApp.

## Checklist del sábado ☑️

- [ ] Schema + seed ejecutados en Supabase, sin errores en el log
- [ ] URL y anon key configuradas en `js/supabase-config.js`
- [ ] Registro de prueba OK + correo de confirmación recibido (verificar SMTP)
- [ ] Login OK; al entrar desde otro navegador, el primero se cierra (sesión única)
- [ ] "¿Olvidaste tu contraseña?" envía correo y el enlace permite cambiar la clave
- [ ] `/privacidad`, `/cookies`, `/terminos`, `/cualquier-rara` (404) cargan bien
- [ ] Pedido de prueba con sesión genera número SP- y llega a WhatsApp
- [ ] Tasa BCV del día actualizada en `site_settings`
- [ ] Primera cuenta admin asignada por SQL
- [ ] Dominio conectado en Vercel y en Supabase (redirect URLs)
- [ ] Probar en móvil (Android/iPhone) el menú, carrito y modales
