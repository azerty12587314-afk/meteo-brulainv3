
'use strict';
window.WeatherHistory=(()=>{
 const $=id=>document.getElementById(id); let climate=null;
 const fmt=d=>d?new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(d+'T12:00:00')):'Date inconnue';
 function events(data){const r=data?.records||{}, out=[];
  if(r.highestTemperature) out.push({type:'temperature',icon:'🔥',title:'Record de chaleur',value:`${r.highestTemperature.value} °C`,date:r.highestTemperature.date});
  if(r.lowestTemperature) out.push({type:'temperature',icon:'❄️',title:'Record de froid',value:`${r.lowestTemperature.value} °C`,date:r.lowestTemperature.date});
  if(r.wettestDay) out.push({type:'rain',icon:'🌧️',title:'Journée la plus arrosée',value:`${r.wettestDay.value} mm`,date:r.wettestDay.date});
  if(r.strongestGust) out.push({type:'wind',icon:'💨',title:'Rafale maximale',value:`${r.strongestGust.value} km/h`,date:r.strongestGust.date});
  const ys=[...(data?.recentYears||[])]; if(ys.length){const warm=ys.filter(y=>Number.isFinite(Number(y.temperatureMean))).sort((a,b)=>b.temperatureMean-a.temperatureMean)[0]; const wet=ys.filter(y=>Number.isFinite(Number(y.precipitation))).sort((a,b)=>b.precipitation-a.precipitation)[0]; if(warm) out.push({type:'temperature',icon:'📈',title:'Année récente la plus chaude',value:`${warm.year} · ${warm.temperatureMean} °C`,date:`${warm.year}-07-01`}); if(wet) out.push({type:'rain',icon:'🌊',title:'Année récente la plus humide',value:`${wet.year} · ${wet.precipitation} mm`,date:`${wet.year}-07-01`});}
  return out.sort((a,b)=>String(b.date).localeCompare(String(a.date)));}
 function render(){const list=$('weather-history-list'); if(!list||!climate)return; const filter=$('weather-history-filter')?.value||'all'; const rows=events(climate).filter(e=>filter==='all'||e.type===filter); list.innerHTML=rows.map(e=>`<article class="weather-history-item" data-type="${e.type}"><span class="weather-history-icon">${e.icon}</span><div><small>${fmt(e.date)}</small><strong>${e.title}</strong><p>${e.value} · source : réanalyse locale</p></div></article>`).join('')||'<p>Aucun événement disponible.</p>'; }
 function init(){if(!$('weather-history-section'))return; $('weather-history-filter')?.addEventListener('change',render); window.addEventListener('climate-data-ready',e=>{climate=e.detail;render()});}
 return{init};})();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',WeatherHistory.init);else WeatherHistory.init();
