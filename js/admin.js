// Sidebar collapse
  const app = document.getElementById('app');
  document.getElementById('toggleSidebar').addEventListener('click', ()=>{
    app.classList.toggle('collapsed');
  });

  // Navigation
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  const pages = document.querySelectorAll('.content');
  const crumb = document.getElementById('crumb');

  const titles = {
    overview:'Overview',
    orders:'Pedidos',
    products:'Productos',
    customers:'Clientes',
    brands:'Marcas y Categorías',
    coupons:'Cupones y Promos',
    reports:'Reportes'
  };

  // Topbar clock
  const adminClock = document.getElementById('adminClock');
  const clockDateFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const clockTimeFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    hour12: false
  });

  function updateAdminClock(){
    if(!adminClock) return;

    const now = new Date();
    const dateParts = Object.fromEntries(
      clockDateFormatter
        .formatToParts(now)
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, part.value.replace(/\./g, '')])
    );
    const date = `${dateParts.day} ${dateParts.month} ${dateParts.year}`;
    const time = clockTimeFormatter.format(now);

    adminClock.textContent = `${date} · ${time}`;
    adminClock.dateTime = now.toISOString();
    adminClock.title = 'Horario Argentina';
  }

  updateAdminClock();
  setInterval(updateAdminClock, 1000);

  function navigate(view){
    navItems.forEach(n=>n.classList.toggle('active', n.dataset.view===view));
    pages.forEach(p=>p.classList.toggle('active', p.dataset.page===view));
    crumb.textContent = titles[view] || view;
    window.scrollTo({top:0,behavior:'smooth'});
  }
  window.navigate = navigate;

  navItems.forEach(item=>{
    item.addEventListener('click', e=>{
      e.preventDefault();
      navigate(item.dataset.view);
    });
  });

  document.querySelectorAll('[data-navigate]').forEach(item=>{
    item.addEventListener('click', e=>{
      e.preventDefault();
      navigate(item.dataset.navigate);
    });
  });
