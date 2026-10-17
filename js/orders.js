/* ============================================================================
   SUSHI POKE — Registro de pedidos en Supabase (opcional pero recomendado)
   Uso: en index.html cambia onclick="checkout()" por onclick="checkoutWithDB()"
   - Si el usuario tiene sesión: guarda el pedido en la BD y luego abre
     WhatsApp con el número de pedido incluido.
   - Si no tiene sesión: mantiene el flujo actual de WhatsApp directo.
   ============================================================================ */
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
   async function checkoutWithDB() {
    const cart = JSON.parse(localStorage.getItem('sushiCart')) || [];
    if (!cart.length) return;
  
    const { data: { session } } = await sb.auth.getSession();
  
    // Sin sesión: flujo original sin cambios
    if (!session) { checkout(); return; }
  
    // Con sesión: registrar pedido en Supabase
    const items = cart.map(i => ({
      product_name: i.name,
      unit_price: i.price,
      quantity: i.qty,
      image_url: i.img || null
    }));
  
    const { data: order, error } = await sb.rpc('create_order', {
      p_items: items,
      p_order_type: 'delivery',
      p_payment_method: 'Por confirmar por WhatsApp',
      p_notes: null,
      p_currency: 'USD'
    });
  
    if (error) {
      spToast('No pudimos registrar el pedido, te llevamos a WhatsApp directamente.');
      checkout();
      return;
    }
  
    // Marcar pedido como enviado por WhatsApp y vaciar carrito
    await sb.from('orders')
      .update({ whatsapp_sent: true })
      .eq('id', order.id);
  
    localStorage.removeItem('sushiCart');
    if (typeof cart !== 'undefined') { cart.length = 0; }
    if (typeof updateCartUI === 'function') updateCartUI();
    spToast('Pedido ' + order.order_number + ' registrado ✅');
  
    // Abrir WhatsApp con el resumen + número de pedido
    let msg = '¡Hola Sushi Poke! Quiero confirmar el pedido *' + order.order_number + '*:%0A%0A';
    items.forEach(i => {
      msg += '• ' + i.product_name + ' x' + i.quantity +
             ' - $' + (i.unit_price * i.quantity).toFixed(2) + '%0A';
    });
    msg += '%0ATotal: $' + parseFloat(order.total).toFixed(2) + '%0A%0AGracias!';
    window.open('https://wa.me/584243678252?text=' + msg, '_blank');
  
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    if (drawer && drawer.classList.contains('active')) {
      drawer.classList.remove('active');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  }