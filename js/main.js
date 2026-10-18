// Los productos se cargan desde Supabase (tabla public.products).
        let products = [];

        let cart = JSON.parse(localStorage.getItem('sushiCart')) || [];
        let currentCategory = 'all';
        let sliderIndex = 0;
        const HOME_PRODUCT_LIMIT = 8;

        // Init: espera a Supabase antes de pintar el menú.
        document.addEventListener('DOMContentLoaded', async () => {
            updateCartUI();
            initSliderDots();
            initScrollAnimations();
            initHeaderScroll();
            await loadProducts();
            renderProducts();
            syncCartPrices();
            updateCartUI();
        });

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

        function escapeHTML(value) {
            return String(value ?? '').replace(/[&<>"']/g, character => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[character]);
        }

        async function loadProducts() {
            const grid = document.getElementById('productsGrid');
            grid.textContent = 'Cargando menú...';

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
                grid.textContent = 'No pudimos cargar el menú en este momento. Intenta nuevamente más tarde.';
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

        // Products
        function renderProducts(filter = currentCategory, productsToRender = null, limit = HOME_PRODUCT_LIMIT) {
            const grid = document.getElementById('productsGrid');
            const source = productsToRender || products;
            const inScope = filter === 'all' ? source : source.filter(p => p.category === filter);

            // En la home mostramos solo un extracto: destacados primero.
            let filtered = inScope;
            if (limit && inScope.length > limit) {
                filtered = [
                    ...inScope.filter(p => p.featured),
                    ...inScope.filter(p => !p.featured)
                ].slice(0, limit);
            }

            updateMenuMoreCTA(inScope.length, filtered.length);

            if (!filtered.length) {
                grid.textContent = products.length
                    ? 'No hay productos en esta categoría.'
                    : 'El menú estará disponible en breve.';
                return;
            }

            grid.innerHTML = filtered.map(p => `
                <article class="product-card fade-in visible">
                    <div style="position: relative; overflow: hidden;">
                        ${p.img ? `<img src="${escapeHTML(p.img)}" alt="${escapeHTML(p.name)}" class="product-image" loading="lazy" referrerpolicy="no-referrer">` : ''}
                        ${p.featured ? '<span class="product-tag">TOP</span>' : ''}
                    </div>
                    <div class="product-info">
                        <h4>${escapeHTML(p.name)}</h4>
                        <p class="product-desc">${escapeHTML(p.desc)}</p>
                        <div class="product-meta">
                            <span class="product-price">$${p.price.toFixed(2)}</span>
                            <button class="btn-add" type="button" data-product-id="${escapeHTML(p.id)}">
                                <i class="fas fa-plus"></i> Añadir
                            </button>
                        </div>
                    </div>
                </article>
            `).join('');

            grid.querySelectorAll('[data-product-id]').forEach(button => {
                button.addEventListener('click', () => {
                    const product = products.find(p => p.id === button.dataset.productId);
                    if (product) addToCart(product.name, product.price, product.img);
                });
            });
        }

        // Muestra/actualiza el bloque "Ver menú completo" bajo la grilla de la home.
        function updateMenuMoreCTA(totalInScope, shown) {
            const wrap = document.getElementById('menuMoreWrap');
            const label = document.getElementById('menuMoreCount');
            if (!wrap) return;

            if (!products.length) {
                wrap.hidden = true;
                return;
            }

            const remaining = Math.max(0, totalInScope - shown);
            wrap.hidden = false;

            if (label) {
                label.textContent = remaining > 0
                    ? `Mostrando ${shown} de ${totalInScope}. Hay ${remaining} producto${remaining === 1 ? '' : 's'} más esperándote.`
                    : 'Explora todas nuestras categorías y productos.';
            }
        }

        function filterCategory(cat, el) {
            currentCategory = cat;
            document.querySelectorAll('.category-list li').forEach(li => li.classList.remove('active'));
            el.classList.add('active');
            renderProducts(cat);
        }

        // Cart
        function addToCart(name, price, img) {
            const existing = cart.find(item => item.name === name);
            if (existing) {
                existing.qty++;
            } else {
                cart.push({ name, price, img, qty: 1 });
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

            itemsContainer.innerHTML = cart.map((item, i) => {
                const safeName = escapeHTML(item.name);
                const safeImg  = escapeHTML(item.img || '');
                const lineTotal = Number(item.price) * Number(item.qty);

                return `
                    <div class="cart-item">
                        ${safeImg
                            ? `<img src="${safeImg}" alt="${safeName}" loading="lazy" referrerpolicy="no-referrer">`
                            : `<div class="cart-item-placeholder" aria-hidden="true"><i class="fas fa-fish"></i></div>`}
                        <div class="cart-item-info">
                            <h4>${safeName}</h4>
                            <span class="price">$${lineTotal.toFixed(2)}</span>
                            <div class="qty-control" style="margin-top: 6px; display: inline-flex;">
                                <button class="qty-btn" type="button" onclick="updateQty(${i}, -1)" aria-label="Quitar una unidad">-</button>
                                <span class="qty-value">${Number(item.qty)}</span>
                                <button class="qty-btn" type="button" onclick="updateQty(${i}, 1)" aria-label="Añadir una unidad">+</button>
                            </div>
                        </div>
                        <button class="remove-item" type="button" onclick="removeFromCart(${i})" aria-label="Eliminar del carrito">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
            }).join('');

            footer.style.display = 'block';
            totalEl.textContent = '$' + totalPrice.toFixed(2);
        }

        function toggleCart() {
            document.getElementById('cartDrawer').classList.toggle('active');
            document.getElementById('cartOverlay').classList.toggle('active');
            document.body.style.overflow = document.getElementById('cartDrawer').classList.contains('active') ? 'hidden' : '';
        }

        function checkout() {
            if (cart.length === 0) return;
            let msg = "¡Hola Sushi Poke! Quiero hacer un pedido:%0A%0A";
            let total = 0;
            cart.forEach(item => {
                msg += `• ${item.name} x${item.qty} - $${(item.price * item.qty).toFixed(2)}%0A`;
                total += item.price * item.qty;
            });
            msg += `%0ATotal: $${total.toFixed(2)}%0A%0AGracias!`;
            window.open(`https://wa.me/584243678252?text=${msg}`, '_blank');
        }

        // Slider
        function initSliderDots() {
            const track = document.getElementById('promosTrack');
            const cards = track.children;
            const dotsContainer = document.getElementById('sliderDots');
            const dotsCount = Math.ceil(cards.length / 1);

            dotsContainer.innerHTML = Array.from({length: dotsCount}, (_, i) => 
                `<div class="dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})"></div>`
            ).join('');
        }

        function moveSlider(dir) {
            const track = document.getElementById('promosTrack');
            const cards = track.children;
            const maxIndex = Math.ceil(cards.length / 1) - 1;

            sliderIndex += dir;
            if (sliderIndex < 0) sliderIndex = maxIndex;
            if (sliderIndex > maxIndex) sliderIndex = 0;

            updateSlider();
        }

        function goToSlide(index) {
            sliderIndex = index;
            updateSlider();
        }

        function updateSlider() {
            const track = document.getElementById('promosTrack');
            const cardWidth = track.children[0]?.offsetWidth + 24 || 0;
            track.style.transform = `translateX(-${sliderIndex * cardWidth * 1}px)`;

            document.querySelectorAll('.dot').forEach((d, i) => {
                d.classList.toggle('active', i === sliderIndex);
            });
        }

        // FAQ
        function toggleFaq(el) {
            const item = el.parentElement;
            const wasActive = item.classList.contains('active');
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
            if (!wasActive) item.classList.add('active');
        }

        // Modal
        function openModal(id) {
            document.getElementById(id).classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeModal(id) {
            document.getElementById(id).classList.remove('active');
            document.body.style.overflow = '';
        }

        function closeModalOnOverlay(e, id) {
            if (e.target === document.getElementById(id)) closeModal(id);
        }

        function switchModal(from, to) {
            closeModal(from);
            setTimeout(() => openModal(to), 200);
        }

        function handleLogin(e) {
            e.preventDefault();
            showToast('¡Bienvenido de vuelta!');
            closeModal('loginModal');
        }

        function handleRegister(e) {
            e.preventDefault();
            showToast('¡Cuenta creada exitosamente!');
            closeModal('registerModal');
        }

        // Search
        function handleSearch() {
            const query = document.getElementById('searchInput').value.trim().toLocaleLowerCase('es');
            if (!query) {
                renderProducts(currentCategory);
                return;
            }

            const filtered = products.filter(p =>
                p.name.toLocaleLowerCase('es').includes(query) ||
                p.desc.toLocaleLowerCase('es').includes(query) ||
                (CATEGORY_LABELS[p.category] || p.category).toLocaleLowerCase('es').includes(query)
            );

            if (!filtered.length) {
                const grid = document.getElementById('productsGrid');
                grid.textContent = `No encontramos productos con "${query}".`;
            } else {
                renderProducts('all', filtered);
            }
            document.getElementById('menu').scrollIntoView({ behavior: 'smooth' });
        }

        document.getElementById('searchInput').addEventListener('input', () => {
            if (!document.getElementById('searchInput').value.trim()) renderProducts(currentCategory);
        });
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });

        // Formateador de teléfono venezolano
        function initPhoneMask() {
            const phoneInputs = document.querySelectorAll('input[type="tel"]');
            
            phoneInputs.forEach(input => {
                input.addEventListener('input', (e) => {
                    // 1. Quitar todo lo que no sean números
                    let val = e.target.value.replace(/\D/g, '');
                    
                    // 2. Si el usuario pega el +58, lo quitamos para no duplicar
                    if (val.startsWith('58')) val = val.substring(2);
                    
                    // 3. Limitar a 10 dígitos (3 de operadora + 7 de número)
                    if (val.length > 10) val = val.substring(0, 10);
                    
                    // 4. Formatear como +58 XXX-XXXXXXX
                    let formatted = '+58 ';
                    if (val.length > 3) {
                        formatted += val.substring(0, 3) + '-' + val.substring(3);
                    } else {
                        formatted += val;
                    }
                    
                    e.target.value = formatted;
                });

                // Validación extra al enviar el formulario (en tu handleRegister)
                input.addEventListener('blur', () => {
                    if (input.value === '+58 ' || input.value.length < 13) {
                        input.setCustomValidity('Por favor, ingresa un número válido de 10 dígitos.');
                    } else {
                        input.setCustomValidity('');
                    }
                });
            });
        }

        // Llamar a la función cuando cargue el DOM
        document.addEventListener('DOMContentLoaded', initPhoneMask);

        // Toast
        function showToast(message) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
            container.appendChild(toast);

            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            }, 3000);
        }

        // Scroll Animations
        function initScrollAnimations() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                    }
                });
            }, { threshold: 0.1 });

            document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
        }

        // Header scroll
        function initHeaderScroll() {
            window.addEventListener('scroll', () => {
                document.getElementById('header').classList.toggle('scrolled', window.scrollY > 50);
            });
        }
