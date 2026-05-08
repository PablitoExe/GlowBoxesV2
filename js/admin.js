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
    brands:'Marcas y CategorÃ­as',
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

  // Build heatmap
  const hm = document.getElementById('heatmap');
  if(hm){
    const hours = ['00','04','08','12','16','20'];
    const data = [
      [.1,.05,.05,.1,.15,.3,.2],
      [.05,.05,.05,.05,.1,.2,.15],
      [.2,.3,.4,.45,.5,.6,.4],
      [.55,.7,.75,.8,.95,.85,.5],
      [.65,.75,.8,.85,.9,.7,.45],
      [.4,.5,.55,.6,.7,.55,.3],
    ];
    hours.forEach((h,r)=>{
      const lbl = document.createElement('div');
      lbl.style.cssText='font-family:Space Mono,monospace;font-size:9px;color:#5a5a66;display:grid;place-items:center;letter-spacing:.1em';
      lbl.textContent = h;
      hm.appendChild(lbl);
      for(let c=0;c<7;c++){
        const cell = document.createElement('div');
        const v = data[r][c];
        cell.style.cssText = `aspect-ratio:1;background:rgba(168,107,255,${.08 + v*.85});border:1px solid rgba(255,255,255,.04);transition:.15s;cursor:pointer;${v>.7?'box-shadow:0 0 6px rgba(168,107,255,.4)':''}`;
        cell.title = `${h}:00 â€” ${Math.round(v*100)}% del max`;
        hm.appendChild(cell);
      }
    });
  }
