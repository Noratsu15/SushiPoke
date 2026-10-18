/* ============================================================================
   SUSHI POKE — Módulo de autenticación, perfil y sesión
   ============================================================================ */

   const SP_TOKEN_KEY = 'sp_session_token';
   let spCurrentUser = null;
   let spRecoveryMode = false;
   
   /* ------------------------------- Utilidades ------------------------------ */
   
   function spToast(message) {
     if (typeof showToast === 'function') { showToast(message); return; }
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
     if (msg.includes('Email not confirmed'))     return 'Debes confirmar tu correo antes de entrar.';
     if (msg.includes('already registered') || msg.includes('already been registered'))
       return 'Este correo ya está registrado. Inicia sesión o recupera tu clave.';
     if (msg.includes('Password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
     if (msg.includes('duplicate key') && msg.includes('profiles_phone'))
       return 'Este teléfono ya está registrado en otra cuenta.';
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
     if (!session) { spCurrentUser = null; refreshAuthUI(); return; }
   
     const token = localStorage.getItem(SP_TOKEN_KEY);
     if (!token) { await spForceLogout(false); return; }
   
     const { data: valid } = await sb.rpc('validate_session', { p_token: token });
     if (!valid) {
       await spForceLogout(true);
     }
   }
   
   async function spForceLogout(notify) {
    const token = localStorage.getItem(SP_TOKEN_KEY);
    
    // 1. Intentar cerrar la sesión en la base de datos (RPC)
    try {
      if (token) {
        await sb.rpc('close_session', { p_token: token });
      }
    } catch (error) {
      // Si falla el RPC (porque no hay sesión en DB o error de red), lo ignoramos silenciosamente
      console.warn('Nota: No se pudo cerrar la sesión remota (puede que ya estuviera cerrada).');
    }
  
    // 2. Cerrar la sesión local de Supabase Auth
    try {
      await sb.auth.signOut();
    } catch (error) {
      console.warn('Nota: Error al hacer signOut local.');
    }
  
    // 3. Limpieza local y actualización de la UI
    localStorage.removeItem(SP_TOKEN_KEY);
    spCurrentUser = null;
    refreshAuthUI();
  
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
   
     if (fullName.length < 2)        { spToast('Ingresa tu nombre completo.'); return; }
     if (!spValidPassword(password)) { spToast('La contraseña debe tener mínimo 8 caracteres, letras y números.'); return; }
   
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
       await spLoadProfile();
       refreshAuthUI();
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
   
     try {
       await spRegisterSession();
     } catch (err) {
       await sb.auth.signOut();
       spToast('No se pudo iniciar la sesión segura. Intenta de nuevo.');
       return;
     }
   
     spCurrentUser = data.user;
     await spLoadProfile();
     refreshAuthUI();
     spToast('¡Bienvenido de vuelta! 🍣');
     if (typeof closeModal === 'function') closeModal('loginModal');
   }
   
   /* ------------------------------- Logout ---------------------------------- */
   
   async function handleLogout(e) {
    // Si viene de un evento de clic, prevenimos que el enlace recargue o salte
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault(); 
    }
  
    // Llamamos a la función que acabamos de arreglar
    await spForceLogout(false);
    
    // Cerramos el modal y mostramos el mensaje
    if (typeof closeModal === 'function') {
      closeModal('profileModal');
    }
    spToast('Sesión cerrada correctamente.');
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
   
     await sb.auth.signOut().catch(() => {});
     localStorage.removeItem(SP_TOKEN_KEY);
     spToast('¡Contraseña actualizada! Inicia sesión con tu nueva clave.');
     setTimeout(() => { window.location.href = '/?login=1'; }, 1500);
   }
   
   /* ------------------------- Perfil de Usuario ----------------------------- */
   
   async function spLoadProfile() {
     if (!spCurrentUser) return;
     const { data } = await sb.from('profiles').select('*').eq('id', spCurrentUser.id).single();
     spCurrentUser.profile = data || null;
   }
   
   async function openProfileModal() {
     if (!spCurrentUser) return;
     await spLoadProfile();
     
     const p = spCurrentUser.profile;
     document.getElementById('profileName').value = p?.full_name || '';
     document.getElementById('profilePhone').value = p?.phone || '';
     
     const imgPreview = document.getElementById('profileAvatarPreview');
     if (p?.avatar_url) {
       imgPreview.src = p.avatar_url;
     } else {
       imgPreview.src = 'https://via.placeholder.com/100'; // Fallback
     }
     
     if (typeof openModal === 'function') openModal('profileModal');
   }
   
   async function uploadAvatar(event) {
     const file = event.target.files[0];
     if (!file) return;
     
     const { data: { user } } = await sb.auth.getUser();
     const fileExt = file.name.split('.').pop();
     const filePath = `${user.id}/avatar.${fileExt}`;
   
     const btn = document.querySelector('label[for="avatarUpload"]');
     if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';
   
     const { error: uploadError } = await sb.storage.from('avatars').upload(filePath, file, { upsert: true });
     
     if (uploadError) {
       spToast('Error al subir imagen. Verifica tu conexión.');
       if (btn) btn.innerHTML = '<i class="fas fa-camera"></i> Cambiar foto';
       return;
     }
   
     const { data: { publicUrl } } = sb.storage.from('avatars').getPublicUrl(filePath);
     
     // Añadimos un timestamp para forzar la recarga de la imagen en caché
     const finalUrl = `${publicUrl}?t=${Date.now()}`;
     
     await sb.from('profiles').update({ avatar_url: finalUrl }).eq('id', user.id);
     
     document.getElementById('profileAvatarPreview').src = finalUrl;
     if (btn) btn.innerHTML = '<i class="fas fa-camera"></i> Cambiar foto';
     spToast('Foto actualizada correctamente');
   }
   
   async function handleUpdateProfile(event) {
     event.preventDefault();
     const { data: { user } } = await sb.auth.getUser();
     
     const btn = event.target.querySelector('button[type="submit"]');
     if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
   
     const { error } = await sb.from('profiles').update({
         full_name: document.getElementById('profileName').value,
         phone: document.getElementById('profilePhone').value
     }).eq('id', user.id);
   
     if (btn) { btn.disabled = false; btn.textContent = 'Guardar Cambios'; }
   
     if (error) { spToast('Error al guardar los datos.'); return; }
     
     spToast('Perfil actualizado correctamente');
     await spLoadProfile();
     if (typeof closeModal === 'function') closeModal('profileModal');
   }
   
   /* ------------------- UI: Estado del botón de usuario --------------------- */
   
   function refreshAuthUI() {
     const userBtn = document.getElementById('userNavBtn');
     if (!userBtn) return;
   
     if (spCurrentUser) {
       // Usuario logueado: Icono de check + abre perfil
       userBtn.innerHTML = '<i class="fas fa-user-check" style="color: var(--primary);"></i>';
       userBtn.title = 'Mi Perfil';
       userBtn.onclick = openProfileModal;
     } else {
       // Invitado: Icono normal + abre login
       userBtn.innerHTML = '<i class="fas fa-user"></i>';
       userBtn.title = 'Mi Cuenta';
       userBtn.onclick = () => { if (typeof openModal === 'function') openModal('loginModal'); };
     }
   }
   
   /* -------------------------------- Arranque ------------------------------- */
   
   document.addEventListener('DOMContentLoaded', async () => {
     // 1. Manejar eventos de autenticación en tiempo real
     sb.auth.onAuthStateChange((event, session) => {
       if (event === 'PASSWORD_RECOVERY') {
         spRecoveryMode = true;
         const form = document.getElementById('spResetForm');
         if (form) {
           const warn = document.getElementById('spResetInvalid');
           if (warn) warn.style.display = 'none';
           form.style.display = 'block';
         }
       }
       if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
         spCurrentUser = session.user;
         refreshAuthUI();
       }
       if (event === 'SIGNED_OUT') {
         spCurrentUser = null;
         refreshAuthUI();
       }
     });
   
     // 2. Validar sesión al cargar la página
     const { data: { session } } = await sb.auth.getSession();
     if (session) {
       spCurrentUser = session.user;
       await spValidateSession();
       if (spCurrentUser) await spLoadProfile();
     }
     
     // 3. Renderizar UI inicial
     refreshAuthUI();
   
     // 4. Validaciones periódicas
     setInterval(spValidateSession, 5 * 60 * 1000);
     document.addEventListener('visibilitychange', () => {
       if (!document.hidden) spValidateSession();
     });
   
     // 5. Lógica de redirección tras recuperar contraseña
     if (new URLSearchParams(location.search).get('login') === '1' &&
         typeof openModal === 'function') {
       openModal('loginModal');
     }
   });