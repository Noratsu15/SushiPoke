/* ============================================================================
   SUSHI POKE — Módulo de autenticación
   - Login / registro con Supabase Auth
   - Prevención de inicio de sesión duplicado (una sola sesión activa)
   - Recuperación y restablecimiento de contraseña
   - Es drop-in: sobrescribe handleLogin / handleRegister del index.html
   ============================================================================ */

   const SP_TOKEN_KEY = 'sp_session_token';
   let spCurrentUser = null;
   let spRecoveryMode = false;
   
   /* ------------------------------- Utilidades ------------------------------ */
   
   function spToast(message) {
     if (typeof showToast === 'function') { showToast(message); return; }
     // Fallback para páginas standalone (recuperar/restablecer)
     let el = document.createElement('div');
     el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
       'background:#1a1a1a;color:#fff;padding:14px 24px;border-radius:10px;' +
       'z-index:9999;font-family:Poppins,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)';
     el.textContent = message;
     document.body.appendChild(el);
     setTimeout(() => el.remove(), 3500);
   }
   
   function spFriendlyError(error) {
     const msg = (error && (error.message || error.error_description)) || 'Error inesperado';
     if (msg.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
     if (msg.includes('Email not confirmed'))     return 'Debes confirmar tu correo antes de entrar (revisa tu bandeja).';
     if (msg.includes('already registered') || msg.includes('already been registered'))
       return 'Este correo ya está registrado. Inicia sesión o recupera tu clave.';
     if (msg.includes('Password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
     if (msg.includes('duplicate key') && msg.includes('profiles_phone'))
       return 'Este teléfono ya está registrado en otra cuenta.';
     if (msg.includes('session') && msg.includes('closed')) return 'Tu sesión fue cerrada desde otro dispositivo.';
     return msg;
   }
   
   function spValidPassword(pwd) {
     return pwd.length >= 8 && /[A-Za-z]/.test(pwd) && /\d/.test(pwd);
   }
   
   /* ------------------------- Sesión única (anti duplicado) ----------------- */
   
   async function spRegisterSession() {
     const token = crypto.randomUUID();
     const { error } = await sb.rpc('register_session', {
       p_token: token,
       p_user_agent: navigator.userAgent
     });
     if (error) throw error;
     localStorage.setItem(SP_TOKEN_KEY, token);
   }
   
   async function spValidateSession() {
     const { data: { session } } = await sb.auth.getSession();
     if (!session) { spCurrentUser = null; spRenderAuthState(); return; }
   
     const token = localStorage.getItem(SP_TOKEN_KEY);
     if (!token) { await spForceLogout(false); return; }
   
     const { data: valid } = await sb.rpc('validate_session', { p_token: token });
     if (!valid) {
       await spForceLogout(true); // otro dispositivo inició sesión
     }
   }
   
   async function spForceLogout(notify) {
     const token = localStorage.getItem(SP_TOKEN_KEY);
     if (token) await sb.rpc('close_session', { p_token: token }).catch(() => {});
     await sb.auth.signOut().catch(() => {});
     localStorage.removeItem(SP_TOKEN_KEY);
     spCurrentUser = null;
     spRenderAuthState();
     if (notify) {
       spToast('Sesión cerrada: se inició sesión desde otro dispositivo.');
     }
   }
   
   /* ------------------------------- Registro -------------------------------- */
   
   async function handleRegister(e) {
     e.preventDefault();
     const [nameInput, emailInput, phoneInput, pwdInput] = e.target.elements;
   
     const fullName = nameInput.value.trim();
     const email    = emailInput.value.trim();
     const phone    = phoneInput.value.trim();
     const password = pwdInput.value;
   
     if (fullName.length < 2)            { spToast('Ingresa tu nombre completo.'); return; }
     if (!spValidPassword(password))     { spToast('La contraseña debe tener mínimo 8 caracteres, letras y números.'); return; }
   
     const btn = e.target.querySelector('button[type="submit"]');
     if (btn) { btn.disabled = true; btn.textContent = 'Creando cuenta...'; }
   
     const { data, error } = await sb.auth.signUp({
       email, password,
       options: { data: { full_name: fullName, phone } }
     });
   
     if (btn) { btn.disabled = false; btn.textContent = 'Registrarme'; }
   
     if (error) { spToast(spFriendlyError(error)); return; }
   
     if (data.session) {
       await spRegisterSession();
       spCurrentUser = data.user;
       spRenderAuthState();
       spToast('¡Cuenta creada exitosamente! Bienvenido 🍣');
       if (typeof closeModal === 'function') closeModal('registerModal');
     } else {
       spToast('¡Registro exitoso! Revisa tu correo para confirmar la cuenta.');
       if (typeof closeModal === 'function') closeModal('registerModal');
     }
   }
   
   /* -------------------------------- Login ---------------------------------- */
   
   async function handleLogin(e) {
     e.preventDefault();
     const [emailInput, pwdInput] = e.target.elements;
     const email = emailInput.value.trim();
     const password = pwdInput.value;
   
     const btn = e.target.querySelector('button[type="submit"]');
     if (btn) { btn.disabled = true; btn.textContent = 'Ingresando...'; }
   
     const { data, error } = await sb.auth.signInWithPassword({ email, password });
   
     if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
   
     if (error) { spToast(spFriendlyError(error)); return; }
   
     // ⚠️ Punto clave anti duplicado: cierra cualquier sesión previa
     // del mismo usuario en otros dispositivos/navegadores.
     try {
       await spRegisterSession();
     } catch (err) {
       await sb.auth.signOut();
       spToast('No se pudo iniciar la sesión segura. Intenta de nuevo.');
       return;
     }
   
     spCurrentUser = data.user;
     await spLoadProfile();
     spRenderAuthState();
     spToast('¡Bienvenido de vuelta! 🍣');
     if (typeof closeModal === 'function') closeModal('loginModal');
   }
   
   /* ------------------------------- Logout ---------------------------------- */
   
   async function handleLogout() {
     await spForceLogout(false);
     spToast('Sesión cerrada correctamente.');
     const menu = document.getElementById('spAccountMenu');
     if (menu) menu.remove();
   }
   
   /* --------------------- Recuperación de contraseña ------------------------ */
   
   async function handleRecoveryRequest(e) {
     e.preventDefault();
     const email = e.target.elements[0].value.trim();
   
     const btn = e.target.querySelector('button[type="submit"]');
     if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
   
     const { error } = await sb.auth.resetPasswordForEmail(email, {
       redirectTo: window.location.origin + '/restablecer.html'
     });
   
     if (btn) { btn.disabled = false; btn.textContent = 'Enviar enlace'; }
   
     // Mensaje genérico a propósito: no revela si el correo existe (anti enumeración)
     if (error && error.message && !error.message.includes('rate limit')) {
       spToast(spFriendlyError(error));
       return;
     }
     spToast('Si el correo está registrado, recibirás un enlace para restablecer tu clave.');
     if (typeof closeModal === 'function') closeModal('recoveryModal');
   }
   
   async function handlePasswordUpdate(e) {
     e.preventDefault();
     if (!spRecoveryMode) { spToast('El enlace de recuperación no es válido o expiró.'); return; }
   
     const pwd  = e.target.elements[0].value;
     const pwd2 = e.target.elements[1].value;
   
     if (!spValidPassword(pwd))  { spToast('Mínimo 8 caracteres, con letras y números.'); return; }
     if (pwd !== pwd2)           { spToast('Las contraseñas no coinciden.'); return; }
   
     const { error } = await sb.auth.updateUser({ password: pwd });
     if (error) { spToast(spFriendlyError(error)); return; }
   
     // La sesión de recuperación se cierra: el usuario debe entrar con su nueva clave
     await sb.auth.signOut().catch(() => {});
     localStorage.removeItem(SP_TOKEN_KEY);
     spToast('¡Contraseña actualizada! Inicia sesión con tu nueva clave.');
     setTimeout(() => { window.location.href = '/?login=1'; }, 1500);
   }
   
   /* ------------------------- Estado de la cuenta --------------------------- */
   
   async function spLoadProfile() {
     if (!spCurrentUser) return;
     const { data } = await sb.from('profiles').select('*').eq('id', spCurrentUser.id).single();
     spCurrentUser.profile = data || null;
   }
   
   function spRenderAuthState() {
     const btn = document.querySelector('.nav-icons .nav-icon[title="Mi Cuenta"]');
     if (!btn) return;
   
     if (spCurrentUser) {
       const name = (spCurrentUser.profile && spCurrentUser.profile.full_name) ||
                    spCurrentUser.email || 'Cuenta';
       const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
       btn.innerHTML = '<span class="sp-avatar">' + initials + '</span>';
       btn.title = 'Mi Cuenta (' + name + ')';
       btn.onclick = spToggleAccountMenu;
     } else {
       btn.innerHTML = '<i class="fas fa-user"></i>';
       btn.title = 'Mi Cuenta';
       btn.onclick = () => { if (typeof openModal === 'function') openModal('loginModal'); };
     }
   }
   
   function spToggleAccountMenu() {
     const existing = document.getElementById('spAccountMenu');
     if (existing) { existing.remove(); return; }
   
     const name  = (spCurrentUser.profile && spCurrentUser.profile.full_name) || '';
     const email = spCurrentUser.email || '';
   
     const menu = document.createElement('div');
     menu.id = 'spAccountMenu';
     menu.style.cssText =
       'position:fixed;top:82px;right:24px;z-index:1500;background:#fff;border-radius:14px;' +
       'box-shadow:0 15px 45px rgba(0,0,0,.18);padding:18px;width:250px;font-family:Poppins,sans-serif;' +
       'border:1px solid #eee';
     menu.innerHTML =
       '<strong style="display:block;font-size:.95rem;margin-bottom:2px">' + name + '</strong>' +
       '<span style="color:#6c757d;font-size:.8rem;word-break:break-all">' + email + '</span>' +
       '<hr style="border:none;border-top:1px solid #eee;margin:12px 0">' +
       '<button onclick="handleLogout()" style="width:100%;padding:10px;border:none;border-radius:8px;' +
       'background:#c41e3a;color:#fff;font-family:Poppins;font-weight:600;cursor:pointer">' +
       'Cerrar sesión</button>';
   
     document.body.appendChild(menu);
     document.addEventListener('click', function closeOnOutside(ev) {
       if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeOnOutside); }
     });
   }
   
   /* -------------------------------- Arranque ------------------------------- */
   
   document.addEventListener('DOMContentLoaded', async () => {
     // Detecta la sesión de recuperación que viene en la URL (restablecer.html)
     sb.auth.onAuthStateChange((event) => {
       if (event === 'PASSWORD_RECOVERY') {
         spRecoveryMode = true;
         const form = document.getElementById('spResetForm');
         if (form) {
           const warn = document.getElementById('spResetInvalid');
           if (warn) warn.style.display = 'none';
           form.style.display = 'block';
         }
       }
       if (event === 'SIGNED_IN' || event === 'USER_UPDATED') spCurrentUser = spCurrentUser;
       if (event === 'SIGNED_OUT') { spCurrentUser = null; spRenderAuthState(); }
     });
   
     const { data: { session } } = await sb.auth.getSession();
     if (session) {
       spCurrentUser = session.user;
       await spValidateSession();   // expulsa si hay sesión nueva en otro dispositivo
       if (spCurrentUser) await spLoadProfile();
     }
     spRenderAuthState();
   
     // Revalida la sesión periódicamente y al volver a la pestaña
     setInterval(spValidateSession, 5 * 60 * 1000);
     document.addEventListener('visibilitychange', () => {
       if (!document.hidden) spValidateSession();
     });
   
     // ?login=1 abre el modal de login (usado tras restablecer la contraseña)
     if (new URLSearchParams(location.search).get('login') === '1' &&
         typeof openModal === 'function') {
       openModal('loginModal');
     }
   });