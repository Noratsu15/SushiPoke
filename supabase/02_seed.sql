-- ============================================================================
-- SUSHI POKE MARACAY — Datos iniciales (idempotente, se puede re-ejecutar)
-- ============================================================================

-- Configuración del sitio
insert into public.site_settings (key, value) values
  ('delivery', '{"delivery_fee_usd": 2.00, "zones": ["Maracay centro", "La Maracaya", "San Jacinto", "Los Cedros", "El Limon", "La Morita"], "avg_minutes": "30-50"}'::jsonb),
  ('bcv_rate', '{"bs_per_usd": 40.00, "updated_note": "Actualizar a la tasa BCV del dia antes de publicar"}'::jsonb),
  ('site',     '{"whatsapp": "+584243678252", "instagram": "sushipokeoficial", "address": "Calle San Ignacio, Maracay, Edo. Aragua"}'::jsonb)
on conflict (key) do nothing;

-- Productos del menú (los mismos del sitio)
insert into public.products (name, category, price, description, image_url, is_featured) values
  ('California Roll', 'rolls', 5.00, 'Cangrejo, aguacate y pepino con sésamo.', 'https://images.unsplash.com/photo-1559410545-0bdcd187e0a6?w=300&h=200&fit=crop', true),
  ('Philadelphia Roll', 'rolls', 6.00, 'Salmón, queso crema y aguacate.', 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=300&h=200&fit=crop', true),
  ('Spicy Tuna Roll', 'rolls', 6.50, 'Atún picante, mayonesa japonesa y cebollín.', 'https://6a9ad419d601bb7bf57cab50.imgix.net/Spicy-tuna-roll.png', true),
  ('Tempura Roll', 'rolls', 7.00, 'Camarón tempura, aguacate y salsa teriyaki.', 'https://6a9ad419d601bb7bf57cab50.imgix.net/tempura-roll.png', true),
  ('Sashimi Mixto', 'rolls', 12.00, '12 piezas de sashimi: salmón, atún y pez blanco.', 'https://images.unsplash.com/photo-1534482421-64566f976cfa?w=300&h=200&fit=crop', false),
  ('Gyozas (6u)', 'entradas', 4.00, 'Empanadillas japonesas de cerdo al vapor y selladas.', 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=300&h=200&fit=crop', false),
  ('Edamame', 'entradas', 3.00, 'Vainas de soja salteadas con sal de mar.', 'https://6a9ad419d601bb7bf57cab50.imgix.net/edamame.png', false),
  ('Poke Salmón', 'poke', 9.00, 'Arroz, salmón, aguacate, edamame y salsa sésamo.', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&h=200&fit=crop', false),
  ('Poke Atún', 'poke', 9.50, 'Arroz, atún, mango, alga nori y aderezo spicy.', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=300&h=200&fit=crop', false),
  ('Coca-Cola 1L', 'bebidas', 2.00, 'Refresco de cola.', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=300&h=200&fit=crop', false),
  ('Té Verde', 'bebidas', 1.50, 'Té verde japonés frío o caliente.', 'https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?w=300&h=200&fit=crop', false),
  ('Mochi (3u)', 'postres', 4.00, 'Dulce japonés de arroz relleno de helado.', 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=300&h=200&fit=crop', false)
on conflict (name) do nothing;

-- Promociones del slider
insert into public.promotions (name, badge, description, includes, price, currency, image_url, sort_order) values
  ('Combo 30 Piezas', 'Más Popular', '20 piezas de cangrejo y camarón + 10 piezas de pescado con cangrejo.', 'Incluye 1 litro de Coca-Cola.', 15.00, 'USD', 'https://6a9ad419d601bb7bf57cab50.imgix.net/30-piezas.jpg', 1),
  ('Promo 20 Piezas', 'Promo BCV', '20 piezas frías o tempurizadas a elección: camarón, cangrejo, pescado o pollo.', 'Incluye Glup 1L.', 10.00, 'BCV', 'https://6a9ad419d601bb7bf57cab50.imgix.net/20-piezas-glup.jpg', 2),
  ('Promo 10 Piezas', 'Económico', '10 piezas frías o tempurizadas con 1 proteína a elección.', 'Incluye Glup 400ml. Perfecto para uno.', 6.00, 'BCV', 'https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=500&h=300&fit=crop', 3),
  ('Poke Bowl Premium', 'Nuevo', 'Arroz de sushi, salmón fresco, aguacate, edamame, alga nori y salsa de sésamo.', null, 8.50, 'USD', 'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=500&h=300&fit=crop', 4)
on conflict (name) do nothing;