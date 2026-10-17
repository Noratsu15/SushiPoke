/* ============================================================
   menu.js — Lógica de la página de Menú Completo (menu.html)
   Depende de: js/supabase-config.js  ->  window.sb
   ============================================================ */

/* ------------------------------ Estado ------------------------------ */
let products = [];
let cart = JSON.parse(localStorage.getItem('sushiCart')) || [];
let currentCategory = 'all';
let currentQuery = '';
let currentSort = 'default';

const PAGE_SIZE = 24;
let visibleCount = PAGE_SIZE;

const CATEGORY_ORDER = ['rolls', 'tempurizados', 'entradas', 'ensaladas', 'poke', 'bebidas', 'postres'];

const CATEGORY_LABELS = {
    rolls: 'Rolls fríos',
    tempurizados: 'Tempurizados',
    entradas: 'Entradas',
    ensaladas: 'Ensaladas',
    poke: 'Poke Bowls',
    bebidas: 'Bebidas',
    postres: 'Postres'
};

const CATEGORY_ICONS = {
    rolls: 'fa-fish',
    tempurizados: 'fa-fire',
    entradas: 'fa-drumstick-bite',
    ensaladas: 'fa-leaf',
    poke: 'fa-bowl-rice',
    bebidas: 'fa-wine-glass',
    postres: 'fa-ice-cream'
};

/* ------------------------------ Utilidades ------------------------------ */
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

/** Minúsculas + sin acentos, para búsquedas tolerantes. */
function normalize(value) {
    return String(value ?? '')
        .toLocaleLowerCase('es')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function debounce(fn, wait = 220) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

function toggleSearchClear() {
    const wrap = document.getElementById('menuSearchWrap');
    const input = document.getElementById('menuSearchInput');
    if (!wrap || !input) return;
    wrap.classList.toggle('has-value', Boolean(input.value.trim()));
}

/* ------------------------------ Arranque ------------------------------ */
document.addEventListener('DOMContentLoaded', async () => {
    syncHeaderOffset();
    initHeaderScroll();
    bindUI();
    readStateFromURL();
    updateCartUI();

    await loadProducts();

    renderCategoryChips();
    syncCartPrices();
    renderProducts({ reset: true });
    updateCartUI();
});

/* ------------------------------ Header ------------------------------ */
function syncHeaderOffset() {
    const header = document.getElementById('header');
    if (!header) return;

    const height = header.offsetHeight || 72;
    const isFixed = getComputedStyle(header).position === 'fixed';

    document.documentElement.style.setProperty('--header-height', `${height}px`);
    document.documentElement.style.setProperty('--header-offset', isFixed ? `${height}px` : '0px');
}

window.addEventListener('resize', syncHeaderOffset);

function initHeaderScroll() {
    const header = document.getElementById('header');
    if (!header) return;
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
}

/* ------------------------------ Carga de datos ------------------------------ */
async function loadProducts() {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#888;padding:40px 0;">Cargando menú…</p>';

    try {
        const { data, error } = await sb
            .from('products')
            .select('id, name, category, price, description, image_url, is_active, is_featured, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;

        products = (data || []).map(product => ({
            id: product.id,
            name: product.name,
            category: product.category,
            price: Number(product.price),
            desc: product.description || '',
            img: product.image_url || '',
            featured: Boolean(product.is_featured),
            sort_order: Number(product.sort_order || 0)
        })).sort((a, b) => {
            const categoryDifference = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
            return (categoryDifference || 0) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es');
        });
    } catch (error) {
        console.error('[SushiPoke] No se pudo cargar el menú desde Supabase:', error);
        products = [];
        grid.innerHTML = '';
        document.getElementById('resultsCount').textContent = 'Error al cargar';
        document.getElementById('menuEmpty').hidden = false;
        document.getElementById('menuEmptyText').textContent =
            'No pudimos cargar el menú en este momento. Intenta nuevamente más tarde.';
        showToast('No se pudo conectar con el menú.');
    }
}

// Actualiza los precios guardados localmente con los valores actuales de Supabase.
function syncCartPrices() {
    if (!Array.isArray(cart)) cart = [];
    cart = cart.map(item => {
        const product = products.find(p => p.name === item.name);
        return product
            ? { ...item, price: product.price, img: product.img || item.img }
            : item;
    });
    saveCart();
}

/* ------------------------------ Estado en la URL ------------------------------ */
function readStateFromURL() {
    const params = new URLSearchParams(window.location.search);

    const cat = params.get('cat');
    const q = params.get('q');
    const sort = params.get('sort');

    if (cat && (cat === 'all' || CATEGORY_ORDER.includes(cat))) currentCategory = cat;
    if (q) currentQuery = q;
    if (sort && ['default', 'price-asc', 'price-desc', 'name-asc'].includes(sort)) currentSort = sort;

    const input = document.getElementById('menuSearchInput');
    if (input) {
        input.value = currentQuery;
        toggleSearchClear();
    }
    const select = document.getElementById('sortSelect');
    if (select) select.value = currentSort;
}

function writeStateToURL() {
    const params = new URLSearchParams();
    if (currentCategory !== 'all') params.set('cat', currentCategory);
    if (currentQuery) params.set('q', currentQuery);
    if (currentSort !== 'default') params.set('sort', currentSort);

    const qs = params.toString();
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}

/* ------------------------------ Chips de categorías ------------------------------ */
function renderCategoryChips() {
    const container = document.getElementById('categoryChips');
    if (!container) return;

    const counts = products.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + 1;
        return acc;
    }, {});

    const items = [{ key: 'all', label: 'Todo', icon: 'fa-th-large', count: products.length }];

    CATEGORY_ORDER.forEach(key => {
        if (counts[key]) {
            items.push({ key, label: CATEGORY_LABELS[key] || key, icon: CATEGORY_ICONS[key] || 'fa-utensils', count: counts[key] });
        }
    });

    // Categorías que existan en la BD pero no estén en CATEGORY_ORDER
    Object.keys(counts).forEach(key => {
        if (!CATEGORY_ORDER.includes(key)) {
            items.push({ key, label: CATEGORY_LABELS[key] || key, icon: CATEGORY_ICONS[key] || 'fa-utensils', count: counts[key] });
        }
    });

    container.innerHTML = items.map(item => `
        <button type="button"
                class="chip ${item.key === currentCategory ? 'active' : ''}"
                role="tab"
                aria-selected="${item.key === currentCategory}"
                data-category="${escapeHTML(item.key)}">
            <i class="fas ${item.icon}"></i>
            ${escapeHTML(item.label)}
            <span class="chip-count">${item.count}</span>
        </button>
    `).join('');

    container.querySelectorAll('[data-category]').forEach(chip => {
        chip.addEventListener('click', () => selectCategory(chip.dataset.category));
    });
}

function selectCategory(category) {
    if (currentCategory === category) return;
    currentCategory = category;

    document.querySelectorAll('#categoryChips .chip').forEach(chip => {
        const isActive = chip.dataset.category === category;
        chip.classList.toggle('active', isActive);
        chip.setAttribute('aria-selected', String(isActive));
    });

    writeStateToURL();
    renderProducts({ reset: true });
}

/* ------------------------------ Filtrado / orden ------------------------------ */
function getFilteredProducts() {
    const q = normalize(currentQuery);
    let list = products.slice();

    if (currentCategory !== 'all') {
        list = list.filter(p => p.category === currentCategory);
    }

    if (q) {
        list = list.filter(p =>
            normalize(p.name).includes(q) ||
            normalize(p.desc).includes(q) ||
            normalize(CATEGORY_LABELS[p.category] || p.category).includes(q)
        );
    }

    switch (currentSort) {
        case 'price-asc':  list.sort((a, b) => a.price - b.price); break;
        case 'price-desc': list.sort((a, b) => b.price - a.price); break;
        case 'name-asc':   list.sort((a, b) => a.name.localeCompare(b.name, 'es')); break;
        default:
            // Orden "Recomendados": destacados primero, luego el orden de Supabase
            list.sort((a, b) => Number(b.featured) - Number(a.featured));
            break;
    }

    return list;
}

/* ------------------------------ Render de productos ------------------------------ */
function productCardHTML(product) {
    const media = product.img
        ? `<img src="${escapeHTML(product.img)}" alt="${escapeHTML(product.name)}" class="product-image" loading="lazy" referrerpolicy="no-referrer">`
        : `<div class="product-image product-image--placeholder"><i class="fas fa-fish"></i></div>`;

    return `
        <article class="product-card fade-in visible">
            <div class="product-media">
                ${media}
                ${product.featured ? '<span class="product-tag">TOP</span>' : ''}
            </div>
            <div class="product-info">
                <h4>${escapeHTML(product.name)}</h4>
                <p class="product-desc">${escapeHTML(product.desc)}</p>
                <div class="product-meta">
                    <span class="product-price">$${product.price.toFixed(2)}</span>
                    <button class="btn-add" type="button" data-product-id="${escapeHTML(product.id)}">
                        <i class="fas fa-plus"></i> Añadir
                    </button>
                </div>
            </div>
        </article>
    `;
}

function renderProducts({ reset = false } = {}) {
    if (reset) visibleCount = PAGE_SIZE;

    const grid = document.getElementById('productsGrid');
    const emptyState = document.getElementById('menuEmpty');
    const emptyText = document.getElementById('menuEmptyText');
    const loadMoreWrap = document.getElementById('loadMoreWrap');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const resultsCount = document.getElementById('resultsCount');

    if (!products.length) {
        grid.innerHTML = '';
        emptyState.hidden = false;
        loadMoreWrap.hidden = true;
        resultsCount.textContent = 'Sin productos disponibles';
        return;
    }

    const all = getFilteredProducts();
    const shown = all.slice(0, visibleCount);

    const categoryLabel = currentCategory !== 'all'
        ? (CATEGORY_LABELS[currentCategory] || currentCategory)
        : null;

    resultsCount.innerHTML = all.length
        ? `<strong>${all.length}</strong> producto${all.length === 1 ? '' : 's'}${categoryLabel ? ` en ${escapeHTML(categoryLabel)}` : ''}${currentQuery ? ` para “${escapeHTML(currentQuery)}”` : ''}`
        : 'Sin resultados';

    if (!all.length) {
        grid.innerHTML = '';
        emptyState.hidden = false;
        emptyText.textContent = currentQuery
            ? `No encontramos productos que coincidan con “${currentQuery}”.`
            : 'No hay productos disponibles en esta categoría por ahora.';
        loadMoreWrap.hidden = true;
        return;
    }

    emptyState.hidden = true;
    grid.innerHTML = shown.map(productCardHTML).join('');

    const hasMore = shown.length < all.length;
    loadMoreWrap.hidden = !hasMore;
    if (hasMore) {
        loadMoreBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Cargar más productos (${all.length - shown.length})`;
    }
}

/* ------------------------------ Eventos de UI ------------------------------ */
function bindUI() {
    const grid = document.getElementById('productsGrid');
    const searchInput = document.getElementById('menuSearchInput');
    const searchClear = document.getElementById('menuSearchClear');
    const searchWrap = document.getElementById('menuSearchWrap');
    const sortSelect = document.getElementById('sortSelect');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    // Delegación de eventos para "Añadir"
    grid.addEventListener('click', event => {
        const button = event.target.closest('[data-product-id]');
        if (!button) return;
        const product = products.find(p => String(p.id) === button.dataset.productId);
        if (product) addToCart(product.name, product.price, product.img);
    });

    // Búsqueda con debounce
    const runSearch = debounce(value => {
        currentQuery = value.trim();
        writeStateToURL();
        renderProducts({ reset: true });
    }, 240);

    searchInput.addEventListener('input', () => {
        toggleSearchClear();
        runSearch(searchInput.value);
    });

    searchInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            currentQuery = searchInput.value.trim();
            writeStateToURL();
            renderProducts({ reset: true });
        }
        if (event.key === 'Escape') clearSearch();
    });

    searchClear.addEventListener('click', clearSearch);

    function toggleSearchClear() {
        searchWrap.classList.toggle('has-value', Boolean(searchInput.value.trim()));
    }

    function clearSearch() {
        searchInput.value = '';
        currentQuery = '';
        toggleSearchClear();
        writeStateToURL();
        renderProducts({ reset: true });
        searchInput.focus();
    }

    // Ordenamiento
    sortSelect.addEventListener('change', () => {
        currentSort = sortSelect.value;
        writeStateToURL();
        renderProducts({ reset: true });
    });

    // Cargar más
    loadMoreBtn.addEventListener('click', () => {
        visibleCount += PAGE_SIZE;
        renderProducts();
    });

    // Cerrar carrito con Escape
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const drawer = document.getElementById('cartDrawer');
        if (drawer.classList.contains('active')) toggleCart();
    });
}

/** Limpia todos los filtros (usado por el botón del estado vacío). */
function clearFilters() {
    currentCategory = 'all';
    currentQuery = '';
    currentSort = 'default';

    const input = document.getElementById('menuSearchInput');
    if (input) input.value = '';
    document.getElementById('menuSearchWrap')?.classList.remove('has-value');

    const select = document.getElementById('sortSelect');
    if (select) select.value = 'default';

    document.querySelectorAll('#categoryChips .chip').forEach(chip => {
        const isActive = chip.dataset.category === 'all';
        chip.classList.toggle('active', isActive);
        chip.setAttribute('aria-selected', String(isActive));
    });

    writeStateToURL();
    renderProducts({ reset: true });
}

/** Redirige la búsqueda del header a esta misma página con el query aplicado. */
function goToMenuSearch() {
    const input = document.getElementById('headerSearchInput');
    const q = (input?.value || '').trim();
    window.location.href = q ? `menu.html?q=${encodeURIComponent(q)}` : 'menu.html';
}

/* ------------------------------ Carrito ------------------------------ */
function addToCart(name, price, img) {
    const existing = cart.find(item => item.name === name);
    if (existing) {
        existing.qty++;
    } else {
        cart.push({ name, price, img: img || '', qty: 1 });
    }
    saveCart();
    updateCartUI();
    showToast(`${name} añadido al carrito`);
}

function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
    updateCartUI();
}

function updateQty(index, delta) {
    if (!cart[index]) return;
    cart[index].qty += delta;
    if (cart[index].qty <= 0) removeFromCart(index);
    else { saveCart(); updateCartUI(); }
}

function saveCart() {
    localStorage.setItem('sushiCart', JSON.stringify(cart));
}

function updateCartUI() {
    const badge = document.getElementById('cartBadge');
    const itemsContainer = document.getElementById('cartItems');
    const footer = document.getElementById('cartFooter');
    const totalEl = document.getElementById('cartTotal');
    if (!badge || !itemsContainer) return;

    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    badge.textContent = totalQty;
    badge.style.display = totalQty > 0 ? 'flex' : 'none';

    if (cart.length === 0) {
        itemsContainer.innerHTML = `
            <div class="cart-empty">
                <i class="fas fa-shopping-basket"></i>
                <p>Tu carrito está vacío</p>
                <span style="font-size: 0.9rem;">¡Agrega algunos rolls deliciosos!</span>
            </div>`;
        footer.style.display = 'none';
        return;
    }

    itemsContainer.innerHTML = cart.map((item, i) => `
        <div class="cart-item">
            <img src="${escapeHTML(item.img || '')}" alt="${escapeHTML(item.name)}">
            <div class="cart-item-info">
                <h4>${escapeHTML(item.name)}</h4>
                <span class="price">$${(item.price * item.qty).toFixed(2)}</span>
                <div class="qty-control" style="margin-top: 6px; display: inline-flex;">
                    <button class="qty-btn" type="button" onclick="updateQty(${i}, -1)">-</button>
                    <span class="qty-value">${item.qty}</span>
                    <button class="qty-btn" type="button" onclick="updateQty(${i}, 1)">+</button>
                </div>
            </div>
            <button class="remove-item" type="button" onclick="removeFromCart(${i})"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');

    footer.style.display = 'block';
    totalEl.textContent = '$' + totalPrice.toFixed(2);
}

function toggleCart() {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    drawer.classList.toggle('active');
    overlay.classList.toggle('active');
    document.body.style.overflow = drawer.classList.contains('active') ? 'hidden' : '';
}

/* ------------------------------ UI compartida (con guardas) ------------------------------ */
window.showToast = window.showToast || function (message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${escapeHTML(message)}`;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
};

window.openModal = window.openModal || function (id) {
    document.getElementById(id)?.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.closeModal = window.closeModal || function (id) {
    document.getElementById(id)?.classList.remove('active');
    document.body.style.overflow = '';
};

window.closeModalOnOverlay = window.closeModalOnOverlay || function (event, id) {
    if (event.target === document.getElementById(id)) closeModal(id);
};

window.switchModal = window.switchModal || function (from, to) {
    closeModal(from);
    setTimeout(() => openModal(to), 200);
};

window.handleLogin = window.handleLogin || function (event) {
    event.preventDefault();
    showToast('¡Bienvenido de vuelta!');
    closeModal('loginModal');
};

window.handleRegister = window.handleRegister || function (event) {
    event.preventDefault();
    showToast('¡Cuenta creada exitosamente!');
    closeModal('registerModal');
};

window.handleRecoveryRequest = window.handleRecoveryRequest || function (event) {
    event.preventDefault();
    showToast('Te enviamos un enlace de recuperación.');
    closeModal('recoveryModal');
};

/* Fallback por si orders.js no está disponible */
window.checkoutWithDB = window.checkoutWithDB || function () {
    if (!cart.length) return;

    let msg = '¡Hola Sushi Poke! Quiero hacer un pedido:%0A%0A';
    let total = 0;

    cart.forEach(item => {
        msg += `• ${item.name} x${item.qty} - $${(item.price * item.qty).toFixed(2)}%0A`;
        total += item.price * item.qty;
    });

    msg += `%0ATotal: $${total.toFixed(2)}%0A%0AGracias!`;
    window.open(`https://wa.me/584243678252?text=${msg}`, '_blank');
};