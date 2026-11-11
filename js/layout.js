/* ============================================================
   layout.js — Inyección dinámica + Animación de Carga Sutil
   ============================================================ */

   document.addEventListener("DOMContentLoaded", () => {
    // 1. Mostrar loader si no existe en la vista
    ensureLoaderExists();

    // 2. Inyectar componentes del maquetado
    injectLayout();

    // 3. Quitar la pantalla de carga de forma sutil tras inyectar el DOM
    hideLoader();
});

function ensureLoaderExists() {
    if (!document.getElementById('app-loader')) {
        const loaderHTML = `
            <div id="app-loader">
                <div class="menu-splash-card">
                    <!-- Contenido interior descubierto al abrir -->
                    <div class="menu-splash-inside">
                        <img src="favicon_io/apple-touch-icon.svg" alt="SushiPoke" />
                        <h2>Sushi <span>Poke</span></h2>
                        <p>El mejor sabor de Maracay</p>
                    </div>
                    <!-- Tapa frontal de la carta -->
                    <div class="menu-splash-flap">
                        <img src="favicon_io/apple-touch-icon.svg" alt="SushiPoke" />
                        <span>Abrir Carta</span>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('afterbegin', loaderHTML);
    }
}

function hideLoader() {
    requestAnimationFrame(() => {
        // Un ligero retraso para que la animación de apertura de la carta luzca fluida y deliberada
        setTimeout(() => {
            const loader = document.getElementById('app-loader');
            if (loader) {
                loader.classList.add('hidden');
            }
            document.body.classList.add('layout-ready');
        }, 400);
    });
}
function injectLayout() {
    // 1. Header
    const headerContainer = document.getElementById('site-header');
    if (headerContainer) {
        headerContainer.innerHTML = `
            <header class="header" id="header">
                <div class="header-container">
                    <a href="index.html" class="logo">
                        <div class="logo-icon">
                            <picture>
                                <source srcset="favicon_io/apple-touch-icon.svg" type="image/svg+xml" />
                                <img style="height: 49px; width: 49px; text-align: center; border-radius: 100%; margin-top: 12px;" src="favicon_io/apple-touch-icon.svg" alt="SushiPoke" />
                            </picture>
                        </div>
                        <div class="logo-text">Sushi <span>Poke</span></div>
                    </a>
                    <div class="search-bar">
                        <input type="text" placeholder="¿Qué te gustaría comer hoy?" id="headerSearchInput">
                        <button type="button" onclick="if(typeof goToMenuSearch === 'function') { goToMenuSearch(); } else { window.location.href='menu.html'; }"><i class="fas fa-search"></i></button>
                    </div>
                    <div class="nav-icons">
                        <a href="index.html" class="nav-icon" title="Inicio"><i class="fas fa-home"></i></a>
                        <a href="menu.html" class="nav-icon" title="Menú"><i class="fas fa-utensils"></i></a>
                        <button class="nav-icon" type="button" onclick="openModal('loginModal')" title="Mi Cuenta"><i class="fas fa-user"></i></button>
                        <button class="nav-icon" type="button" onclick="toggleCart()" title="Carrito">
                            <i class="fas fa-shopping-cart"></i>
                            <span class="cart-badge">0</span>
                        </button>
                    </div>
                </div>
            </header>
        `;
    }

    // 2. Bottom Navigation Bar (Móvil)
    const bottomNavContainer = document.getElementById('site-bottom-nav');
    if (bottomNavContainer) {
        bottomNavContainer.innerHTML = `
            <nav class="bottom-nav" id="bottomNav">
                <a href="index.html#hero" class="bottom-nav-item" title="Inicio">
                    <div class="bottom-icon-circle">
                        <i class="fas fa-home"></i>
                    </div>
                    <span>Inicio</span>
                </a>
                <a href="menu.html" class="bottom-nav-item" title="Menú">
                    <div class="bottom-icon-circle">
                        <i class="fas fa-utensils"></i>
                    </div>
                    <span>Menú</span>
                </a>
                <button class="bottom-nav-item" type="button" onclick="openModal('loginModal')" title="Mi Cuenta">
                    <div class="bottom-icon-circle">
                        <i class="fas fa-user"></i>
                    </div>
                    <span>Cuenta</span>
                </button>
                <button class="bottom-nav-item cart-trigger-btn" type="button" onclick="toggleCart()" title="Carrito">
                    <div class="bottom-icon-circle">
                        <i class="fas fa-shopping-cart"></i>
                        <span class="cart-badge">0</span>
                    </div>
                    <span>Carrito</span>
                </button>
            </nav>
        `;
    }

    // 3. Modales y Drawer del Carrito
    const modalsContainer = document.getElementById('site-modals');
    if (modalsContainer) {
        modalsContainer.innerHTML = `
            <div class="cart-overlay" id="cartOverlay" onclick="toggleCart()"></div>
            <div class="cart-drawer" id="cartDrawer">
                <div class="cart-header">
                    <h3><i class="fas fa-shopping-cart"></i> Tu Pedido</h3>
                    <button class="close-cart" type="button" onclick="toggleCart()"><i class="fas fa-times"></i></button>
                </div>
                <div class="cart-items" id="cartItems">
                    <div class="cart-empty">
                        <i class="fas fa-shopping-basket"></i>
                        <p>Tu carrito está vacío</p>
                        <span style="font-size: 0.9rem;">¡Agrega algunos rolls deliciosos!</span>
                    </div>
                </div>
                <div class="cart-footer" id="cartFooter" style="display: none;">
                    <div class="cart-total">
                        <span>Total:</span>
                        <span id="cartTotal">$0.00</span>
                    </div>
                    <button class="btn btn-whatsapp" type="button" onclick="checkoutWithDB()">
                        <i class="fab fa-whatsapp"></i> Completar pedido por WhatsApp
                    </button>
                </div>
            </div>

            <!-- Login Modal -->
            <div class="modal-overlay" id="loginModal" onclick="closeModalOnOverlay(event, 'loginModal')">
                <div class="modal">
                    <button class="close-modal" type="button" onclick="closeModal('loginModal')"><i class="fas fa-times"></i></button>
                    <h2>Iniciar Sesión</h2>
                    <p class="subtitle">Accede a tu cuenta para pedidos más rápidos</p>
                    <form onsubmit="handleLogin(event)">
                        <div class="form-group">
                            <label>Correo electrónico</label>
                            <input type="email" placeholder="tu@email.com" required>
                        </div>
                        <div class="form-group">
                            <label>Contraseña</label>
                            <input type="password" placeholder="••••••••" required>
                        </div>
                        <div>
                            <p style="text-align:right;margin:-8px 0 6px">
                                <a href="#" style="color:var(--primary);font-size:.85rem;font-weight:600;text-decoration:none"
                                   onclick="closeModal('loginModal');openModal('recoveryModal');return false;">
                                   ¿Olvidaste tu contraseña?</a>
                            </p>
                        </div>
                        <button type="submit" class="btn btn-primary">Ingresar</button>
                    </form>
                    <div class="modal-footer">
                        ¿No tienes cuenta? <a href="#" onclick="switchModal('loginModal', 'registerModal'); return false;">Regístrate</a>
                    </div>
                </div>
            </div>

            <!-- Register Modal -->
            <div class="modal-overlay" id="registerModal" onclick="closeModalOnOverlay(event, 'registerModal')">
                <div class="modal">
                    <button class="close-modal" type="button" onclick="closeModal('registerModal')"><i class="fas fa-times"></i></button>
                    <h2>Crear Cuenta</h2>
                    <p class="subtitle">Únete y recibe promociones exclusivas</p>
                    <form onsubmit="handleRegister(event)">
                        <div class="form-group">
                            <label>Nombre completo</label>
                            <input type="text" placeholder="Juan Pérez" required>
                        </div>
                        <div class="form-group">
                            <label>Correo electrónico</label>
                            <input type="email" placeholder="tu@email.com" required>
                        </div>
                        <div class="form-group">
                            <label>Teléfono</label>
                            <input type="tel" placeholder="+58 424-0000000" required>
                        </div>
                        <div class="form-group">
                            <label>Contraseña</label>
                            <input type="password" placeholder="••••••••" required>
                        </div>
                        <button type="submit" class="btn btn-primary">Registrarme</button>
                    </form>
                    <div class="modal-footer">
                        ¿Ya tienes cuenta? <a href="#" onclick="switchModal('registerModal', 'loginModal'); return false;">Inicia sesión</a>
                    </div>
                </div>
            </div>

            <!-- Recuperar contraseña -->
            <div class="modal-overlay" id="recoveryModal" onclick="closeModalOnOverlay(event,'recoveryModal')">
                <div class="modal">
                    <button class="close-modal" type="button" onclick="closeModal('recoveryModal')"><i class="fas fa-times"></i></button>
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

            <div class="toast-container" id="toastContainer"></div>
        `;
    }

    // 4. Footer
    const footerContainer = document.getElementById('site-footer');
    if (footerContainer) {
        footerContainer.innerHTML = `
            <footer class="footer">
                <div class="footer-bottom" style="border-top:0;padding-top:0;text-align:center;">
                    <p>Sushi Poke 2026 &copy; Todos los derechos reservados. Diseñado con ❤️ en Maracay, Venezuela.</p>
                </div>
            </footer>
        `;
    }
}