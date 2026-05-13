import { supabase } from './supabase.js'

// ===== Cart desde localStorage =====
const CART_KEY = 'gb_cart';
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
function fmt(n) { return Number(n).toLocaleString('es-AR'); }

function renderSummary() {
  const cart      = getCart();
  const container = document.getElementById('summary-items');
  const countEl   = document.getElementById('summary-count');
  const subtotalEl = document.getElementById('summary-subtotal');
  const totalUnits = cart.reduce((s, i) => s + i.cantidad, 0);

  if (countEl) countEl.textContent = `// ${totalUnits} item${totalUnits !== 1 ? 's' : ''}`;

  const subtotal = cart.reduce((s, i) => s + i.precio * i.cantidad, 0);
  if (subtotalEl) subtotalEl.innerHTML = `<span class="currency">$</span>${fmt(subtotal)}`;

  if (!container) return;

  if (!cart.length) {
    container.innerHTML = `<div style="padding:24px;text-align:center;font-family:'Space Mono',monospace;font-size:11px;color:var(--ink-mute);letter-spacing:.1em">
      // Carrito vacío — <a href="index.html" style="color:var(--violet-glow);text-decoration:underline">Volver</a></div>`;
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-thumb" style="${item.imagen ? `background-image:url(${item.imagen});background-size:cover;background-position:center` : ''}">
        ${item.imagen ? '' : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 2 12 6 8 2"/><path d="M5 8h14l-1 14H6Z"/></svg>`}
        <span class="qty">${item.cantidad}</span>
      </div>
      <div class="cart-info">
        <div class="cart-name">${item.nombre}</div>
        <div class="cart-meta">$${fmt(item.precio)} c/u</div>
      </div>
      <div class="cart-price"><span class="currency">$</span>${fmt(item.precio * item.cantidad)}</div>
    </div>`).join('');
}
renderSummary();

// ===== Stepper =====
  const stepEls = document.querySelectorAll('.step');
  const lineEls = document.querySelectorAll('.step-line');
  const pages = document.querySelectorAll('.step-page');
  let currentStep = 1;

  function goStep(n){
    currentStep = n;
    stepEls.forEach(el=>{
      const s = parseInt(el.dataset.step);
      el.classList.toggle('active', s===n);
      el.classList.toggle('done', s<n);
      const c = el.querySelector('.step-circle');
      if(s<n){
        c.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
      } else {
        c.textContent = String(s).padStart(2,'0');
      }
    });
    lineEls.forEach((l,i)=>l.classList.toggle('done', i<n-1));
    pages.forEach(p=>p.classList.toggle('active', parseInt(p.dataset.page)===n));
    window.scrollTo({top:0, behavior:'smooth'});
  }
  window.goStep = goStep;

  // ===== Shipping selection =====
  const shipOpts = document.querySelectorAll('.ship');
  const shipRow = document.getElementById('shipRow');
  const shipPrices = {pickup:0, own:3500, correo:5890};
  const shipLabels = {pickup:'Retiro en local', own:'Envío Glow Express', correo:'Correo Argentino'};
  let currentShip = 'own';

  shipOpts.forEach(opt=>{
    opt.addEventListener('click', ()=>{
      shipOpts.forEach(o=>o.classList.remove('selected'));
      opt.classList.add('selected');
      currentShip = opt.dataset.ship;
      const cost = shipPrices[currentShip];
      shipRow.querySelector('.val').innerHTML = cost===0
        ? '<span class="acid">GRATIS</span>'
        : '<span class="currency">$</span>'+cost.toLocaleString('es-AR');
      recalcTotal();
    });
  });

  // ===== Payment selection =====
  const payOpts = document.querySelectorAll('.pay');
  const payDiscountRow = document.getElementById('payDiscountRow');
  let currentPay = 'mp';

  payOpts.forEach(opt=>{
    opt.querySelector('.pay-header').addEventListener('click', ()=>{
      payOpts.forEach(o=>o.classList.remove('selected'));
      opt.classList.add('selected');
      currentPay = opt.dataset.pay;
      payDiscountRow.style.display = currentPay==='transfer' ? '' : 'none';
      recalcTotal();
    });
  });

  // ===== Recalc total =====
  function recalcTotal(){
    const cart     = getCart();
    const subtotal = cart.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const ship     = shipPrices[currentShip];
    let total      = subtotal + ship;
    if(currentPay === 'transfer'){
      total = total - Math.round(total * 0.10);
    }
    document.getElementById('grandTotal').innerHTML = '<span class="currency">$</span>' + fmt(total);
  }

  // ===== Copy to clipboard =====
  function copyText(btn, text){
    navigator.clipboard.writeText(text).catch(()=>{});
    const original = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(()=>{
      btn.classList.remove('copied');
      btn.innerHTML = original;
    }, 1600);
  }
  window.copyText = copyText;

  // ===== Finalize — guarda pedido en Supabase =====
  async function finalizePay(){
    const btn = document.querySelector('[onclick="finalizePay()"]');
    if(btn){ btn.disabled = true; btn.textContent = 'Procesando...' }

    const cart     = getCart();
    const subtotal = cart.reduce((s,i) => s + i.precio * i.cantidad, 0);
    const ship     = shipPrices[currentShip];
    let   total    = subtotal + ship;
    let   descuento = 0;
    if(currentPay === 'transfer'){ descuento = Math.round(total * 0.10); total -= descuento; }

    const num = 'GB-' + Date.now().toString().slice(-6);

    // Guardar en Supabase si hay sesión
    const { data: { session } } = await supabase.auth.getSession();
    if(session){
      try {
        const { data: pedido, error: pedidoErr } = await supabase
          .from('pedidos')
          .insert({
            numero:       num,
            user_id:      session.user.id,
            estado:       currentPay === 'transfer' ? 'pendiente' : 'confirmado',
            metodo_pago:  currentPay,
            metodo_envio: currentShip,
            subtotal,
            descuento,
            costo_envio:  ship,
            total,
          })
          .select('id')
          .single();

        if(!pedidoErr && pedido){
          const items = cart.map(i => ({
            pedido_id:       pedido.id,
            producto_id:     i.id || null,
            nombre_producto: i.nombre,
            sku:             i.sku || null,
            cantidad:        i.cantidad,
            precio_unitario: i.precio,
          }));
          await supabase.from('pedido_items').insert(items);
        }
      } catch(e){ console.warn('Supabase order save failed', e) }
    }

    // Limpiar carrito
    localStorage.removeItem(CART_KEY);

    // UI confirmación
    document.getElementById('orderNumber').textContent    = '// #'+num;
    document.getElementById('orderNumberBig').textContent = '#'+num;

    const paymentStatus     = document.getElementById('paymentStatus');
    const paymentStatusDesc = document.getElementById('paymentStatusDesc');
    const stepWhen          = document.getElementById('step-payment-when');
    const stepTitle         = document.getElementById('step-payment-title');
    const stepDesc          = document.getElementById('step-payment-desc');

    if(currentPay === 'transfer'){
      paymentStatus.textContent = 'Pendiente';
      paymentStatus.style.color = 'var(--warn)';
      paymentStatusDesc.textContent = 'Esperando comprobante de transferencia';
      stepWhen.textContent  = 'PRÓXIMO PASO';
      stepTitle.textContent = 'Realizar transferencia';
      stepDesc.textContent  = 'Transferí a la cuenta de Glow Boxes y subí el comprobante en tu cuenta.';
    } else {
      paymentStatus.textContent = 'Acreditado';
      paymentStatus.style.color = 'var(--acid)';
      paymentStatusDesc.textContent = 'Pago confirmado por Mercado Pago';
      stepWhen.textContent  = 'COMPLETADO';
      stepTitle.textContent = 'Pago confirmado';
      stepDesc.textContent  = 'Tu pago se acreditó correctamente vía Mercado Pago.';
    }

    document.getElementById('confirmShip').textContent  = shipLabels[currentShip];
    document.getElementById('confirmTotal').innerHTML   = document.getElementById('grandTotal').innerHTML;

    goStep(3);
  }
  window.finalizePay = finalizePay;

  // Init
  recalcTotal();
