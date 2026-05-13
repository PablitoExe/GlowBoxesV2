const preloader = document.getElementById('preloader');

// Solo mostrar en la primera visita de la sesión
if(sessionStorage.getItem('gb_loaded')){
  preloader.remove();
} else {
  const segContainer = document.getElementById('segments');
  for(let i=0;i<20;i++){const s=document.createElement('div');s.className='seg';segContainer.appendChild(s);}
  const segs = segContainer.querySelectorAll('.seg');
  const statuses = [
    {at:0,text:'Iniciando núcleo'},{at:15,text:'Cargando catálogo'},
    {at:32,text:'Sincronizando stock'},{at:50,text:'Detailing · Audio · Wrap'},
    {at:68,text:'Optimizando render'},{at:85,text:'Calibrando interfaz'},
    {at:96,text:'Listo para arrancar'},
  ];
  const percentEl = document.getElementById('percent');
  const statusEl  = document.getElementById('status');
  const DURATION  = 4000;
  const start     = performance.now();
  function frame(now){
    const t = Math.min((now-start)/DURATION,1);
    const eased = t<.25?t*1.28:t<.55?.32+(t-.25)*.87:t<.78?.58+(t-.55)*.7:.74+(t-.78)*1.18;
    const pct = Math.min(Math.round(eased*100),100);
    percentEl.textContent = String(pct).padStart(2,'0');
    const onCount = Math.round((pct/100)*20);
    segs.forEach((s,i)=>s.classList.toggle('on',i<onCount));
    const current = [...statuses].reverse().find(s=>pct>=s.at);
    if(current && statusEl.dataset.k!==current.text){
      statusEl.dataset.k=current.text;
      statusEl.innerHTML=current.text+'<span class="cursor"></span>';
    }
    if(t<1){requestAnimationFrame(frame);}
    else{
      sessionStorage.setItem('gb_loaded','1');
      setTimeout(()=>{
        preloader.classList.add('done');
        setTimeout(()=>preloader.remove(), 900);
      },450);
    }
  }
  requestAnimationFrame(frame);
}
