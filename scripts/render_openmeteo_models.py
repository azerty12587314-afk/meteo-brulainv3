
jeudi 23:00

Texte collé.txt
Document
voici le code modifie le pour integrer toutes tes modification

vendredi 8:07
4f3a8b73-ba2e-4ceb-9189-443134742457.png
1aef1de8-141d-409a-95d5-43319e9f69eb.png
C est presqque parfait je voudrais rajouter cela en maille fine sur le modele arome
et ca  sur la prevision long terme sur ecwf

Image générée : Interface météo moderne et interactive


Modifier


vendredi 10:47
vendredi 21:33
vendredi 22:36
samedi 22:51

Texte collé(2).txt
Document
'use strict';

window.MeteoApp = (() => {
  let location = loadLocation() || { ...MeteoConfig.defaultLocation };
  let refreshTimer = null;

  function loadLocation() {
    try {
      return JSON.parse(localStorage.getItem('meteo-location'));
    } catch {
      return null;
    }
  }

  function saveLocation(value) {
    localStorage.setItem('meteo-location', JSON.stringify(value));
  }

  async function loadAll(force = false) {
    MeteoUI.setLoading(true);
    if (force) MeteoApi.clearCache();

    try {
      const [forecast, air, models, arome, ecmwfLong] = await Promise.all([
        MeteoApi.getForecast(location),
        MeteoApi.getAirQuality(location).catch(() => null),
        MeteoApi.getModelForecasts(location),
        MeteoApi.getArome48h(location),
        MeteoApi.getEcmwfLongRange(location)
      ]);

      MeteoUI.renderCurrent(forecast, location);
      MeteoUI.renderDashboard(forecast, air);
      MeteoUI.renderHourly(forecast);
      MeteoUI.renderDaily(forecast);
      MeteoUI.renderModelStatuses(models, arome);
      MeteoCharts.renderModels(models);
      MeteoCharts.renderArome(arome, 'temp');
      MeteoCharts.renderEcmwfLong(ecmwfLong);
      MeteoRadar.update(location);
      MeteoAnimations.updateTheme(forecast.current.weather_code, forecast.current.is_day);
    } catch (error) {
      console.error(error);
      MeteoUI.showMessage(
        navigator.onLine
          ? 'Impossible de récupérer les données météo. Réessaie dans quelques instants.'
          : 'Tu es hors connexion. Les données récentes ne peuvent pas être actualisées.'
      );
    } finally {
      MeteoUI.setLoading(false);
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    const input = document.getElementById('location-search');
    const query = input.value.trim();
    if (query.length < 2) {
      MeteoUI.showMessage('Saisis au moins deux caractères.');
      return;
    }
    try {
      const results = await MeteoApi.searchLocation(query);
      MeteoUI.renderSearchResults(results, selectLocation);
    } catch {
      MeteoUI.showMessage('La recherche de ville a échoué.');
    }
  }

  function selectLocation(place) {
    location = {
      name: [place.name, place.admin1].filter(Boolean).join(', '),
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone || 'Europe/Paris'
    };
    saveLocation(location);
    document.getElementById('location-search').value = '';
    loadAll(true);
  }

  function geolocate() {
    if (!navigator.geolocation) {
      MeteoUI.showMessage('La géolocalisation n’est pas disponible dans ce navigateur.');
      return;
    }
    MeteoUI.setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async position => {
        location = {
          name: 'Ma position',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto'
        };
        saveLocation(location);
        await loadAll(true);
      },
      () => {
        MeteoUI.setLoading(false);
        MeteoUI.showMessage('Position non accessible. Vérifie les autorisations du navigateur.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  function bindEvents() {
    document.getElementById('location-form')?.addEventListener('submit', handleSearch);
    document.getElementById('geolocate-button')?.addEventListener('click', geolocate);
    document.getElementById('refresh-button')?.addEventListener('click', () => loadAll(true));
    document.querySelectorAll('[data-arome-type]').forEach(button => {
      button.addEventListener('click', () => MeteoCharts.setAromeType(button.dataset.aromeType));
    });
    window.addEventListener('online', () => loadAll(true));
  }

  async function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
      try {
        await navigator.serviceWorker.register('./service-worker.js');
      } catch (error) {
        console.warn('Service worker non enregistré', error);
      }
    }
  }

  async function init() {
    MeteoUI.ensureToolbar();
    bindEvents();
    MeteoAnimations.reveal();
    await registerServiceWorker();
    await loadAll();

    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => loadAll(true), MeteoConfig.refreshIntervalMs);
  }

  return { init, loadAll };
})();

document.addEventListener('DOMContentLoaded', MeteoApp.init);

hier 10:25

Adobe Scan 06 nov. 2022 (1).pdf
PDF
pour t aider voici mon terrain (entouré) et le potager ( petit carré), la serre se trouve dans le potager et voici le plan de la maison fais moi des recommandations

Super, ça va beaucoup m'aider. En revanche, je n'ai reçu que le plan de la maison. Je ne vois pas encore le plan du terrain entouré avec le potager et la serre. Si tu peux l'ajouter (photo satellite ou capture Google Maps avec les limites), je pourrai te faire un plan très précis des capteurs.

En attendant, avec le plan de la maison que tu as envoyé 

, voilà ce que je recommande.

Maison
D'après le plan, on distingue :

un grand séjour / repas ouvert,

une cuisine séparée,

trois chambres,

une mezzanine,

une lingerie,

un garage. 


Salon / séjour ⭐⭐⭐⭐⭐
➡️ WH45

Pourquoi ?

CO₂

PM2.5

PM10

température

humidité

C'est la pièce où vous passez le plus de temps.

Cuisine ⭐⭐⭐⭐☆
➡️ WH31

Il permettra de voir :

température

humidité

Très utile pour comparer avec le salon.

Chambre 1 ⭐⭐⭐⭐⭐
➡️ WH31

Idéal pour surveiller :

confort nocturne

humidité

risque de condensation

Chambre 2 ⭐⭐⭐⭐☆
➡️ WH31

Même intérêt.

Chambre 3 / Bureau ⭐⭐⭐⭐☆
➡️ WH31

Si elle sert surtout de bureau, cela permettra aussi de suivre le confort en journée.

Mezzanine ⭐⭐⭐⭐⭐
➡️ WH31

Je pense que ce sera un des capteurs les plus intéressants.

Avec la hauteur sous plafond, tu pourras mesurer :

accumulation de chaleur en été ;

différence de température avec le salon.

Ton site pourrait même afficher :

Salon : 23,1°C

Mezzanine : 28,6°C

↑ +5,5°C
Serre
Là, je mettrais :

1 × WH31

2 × WH51

Un WH51 près des tomates.

Un autre dans une autre culture.

Potager
Je répartirais ensuite les sondes selon les cultures.

Exemple :

🍅 tomates

🥒 courgettes

🥔 pommes de terre

🥕 carottes

🥬 salades

🍓 fraises

Soit 6 sondes WH51.

Verger
Si tu as beaucoup d'arbres fruitiers :

2 sondes supplémentaires.

Une près :

des pommiers

Une autre :

des pruniers ou cerisiers.

Extérieur
Je rajouterais :

WH57 (foudre)

WH41 (PM2.5 extérieur)

Ils compléteront très bien la station.

Au final
Matériel	Quantité
GW2001	1
WH45	1
WH31	6
WH51	8
WH57	1
WH41	1
Budget estimatif : environ 700 €.

Ce que je développerais sur ton site
Avec cette installation, ton site pourrait afficher quatre onglets principaux :

🌦️ Météo
AROME

ARPEGE

ECMWF

GFS

Radar

🏡 Maison
plan de la maison avec les températures par pièce ;

qualité de l'air du salon ;

graphiques par pièce.

🌱 Jardin
humidité du sol par zone ;

cumul de pluie ;

besoin d'arrosage estimé.

🍅 Serre
température ;

humidité ;

humidité du sol ;

VPD (déficit de pression de vapeur), très utile pour les cultures sous serre.

J'ai une idée supplémentaire
Comme tu possèdes un terrain, un potager et une serre, je te proposerais aussi d'ajouter une ou deux sondes de température du sol (si tu choisis des capteurs compatibles). Elles sont très utiles pour :

savoir quand semer certaines cultures ;

suivre le réchauffement du sol au printemps ;

détecter un risque de gel au niveau des racines.

C'est une donnée qu'on retrouve souvent dans les stations utilisées en maraîchage.

Ce dont j'ai encore besoin
Envoie-moi maintenant la photo aérienne de ton terrain (Google Maps, Géoportail ou capture avec les limites dessinées). Je te ferai un plan d'implantation avec l'emplacement idéal de :

la station météo (pour éviter les biais de mesure) ;

chaque sonde de sol ;

les capteurs intérieurs ;

les zones à surveiller selon l'exposition au soleil et au vent.

Je pourrai même te faire un schéma annoté directement sur l'image.


voila le plan

Image générée : Plan d'implantation pour station météo


Modifier


Image générée : Carte du terrain et capteurs.


Modifier


hier 20:06
pour mon site j aimerai aussi ajouter un radar meteo avec choix du modele mais en vision europe dans ce style  

je n ai pas generate weather maps

hier 23:22



C est bon tout fonctionne tu peux passer a la v7. il serait bien aussi d ajouter  des legendes sur les echelles là 

je n ai pas Build 1991-2020 climatology


aujourd’hui 7:00
voici ce que j ai

voila ce que j ai 

 voila ce que j obtiens

arome z500 semble ne pas foncitonnre

C'est normal. Cela signifie que ta version n'utilise pas le même script que celui auquel je pensais.

Pour éviter de te faire modifier le mauvais endroit, j'ai besoin de voir le script exact.

Peux-tu m'envoyer le fichier :

scripts/render_openmeteo_models.py
ou, si ce fichier n'existe pas, le contenu du dossier :

scripts/
(une capture d'écran du dossier ou la liste des fichiers suffit).

Ensuite, je te dirai la ligne exacte à modifier, sans approximation.

À mon avis, le problème est probablement dans le script qui génère les cartes ou le manifest.json, pas dans le lecteur du site. Une fois que j'aurai identifié le bon fichier, je te donnerai le correctif précis.



render_openmeteo_models.py
Python

Tu ne l’avais pas, car ton fichier utilise des noms raccourcis : vk au lieu de variable_key, et key au lieu de model_key. 


J’ai corrigé directement ton fichier :

render_openmeteo_models-corrige.py

Renomme-le en :

render_openmeteo_models.py
puis remplace :

scripts/render_openmeteo_models.py
La correction fait trois choses :

elle ignore z500_mslp pour AROME ;

elle supprime l’ancienne entrée Z500 AROME du manifest.json ;

elle supprime le dossier obsolète maps/arome/z500_mslp.

Ensuite, relance :

Generate weather maps
Après le commit automatique et le déploiement GitHub Pages, l’option Z500 + pression ne devrait plus apparaître pour AROME. 


donne moi le fichier telechargeable

Voici le fichier corrigé à télécharger :

📄 render_openmeteo_models-corrige.py

Une fois téléchargé :

Renomme-le en :

render_openmeteo_models.py
Remplace le fichier dans :

scripts/render_openmeteo_models.py
Fais un commit/push sur GitHub.

Lance le workflow Generate weather maps.

Fais un Ctrl + F5 sur le site.

⚠️ En revanche, je pense qu'il vaut mieux aller un peu plus loin.

Le fait qu'AROME propose Z500 + pression alors que la donnée n'est pas exploitable montre qu'il faudrait désormais adapter les variables à chaque modèle plutôt que d'avoir les mêmes pour tous.

Par exemple :

AROME : Température, pluie, rafales, CAPE, humidité, nébulosité…

ARPEGE : Température, pluie, vent, Z500, anomalies…

ICON : Température, pluie, Z500, jet stream…

ECMWF : Toutes les cartes synoptiques (Z500, anomalies, jet, etc.).

Cela rendra l'interface beaucoup plus cohérente et évitera d'afficher des options qui ne sont pas réellement disponibles. C'est une amélioration que je prévois d'intégrer dans la prochaine évolution.


Bibliothèque
/
render_openmeteo_models-corrige.py


#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,math,time,sys,shutil
from datetime import datetime,timedelta,timezone
from pathlib import Path
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np, requests
import cartopy.crs as ccrs, cartopy.feature as cfeature
from scipy.interpolate import griddata
API='https://api.open-meteo.com/v1/forecast'; S=requests.Session(); S.headers.update({'User-Agent':'Meteo-Lab-V8/1.0'})
MODELS={
 'ecmwf':{'label':'ECMWF IFS','api':'ecmwf_ifs025','extent':(-25,45,30,72),'spacing':2.0,'max':240,'step':12},
 'arpege':{'label':'ARPEGE','api':'meteofrance_arpege_europe','extent':(-25,45,30,72),'spacing':2.0,'max':114,'step':6},
 'arome':{'label':'AROME','api':'meteofrance_arome_france_hd','extent':(-6,10,41,52),'spacing':0.5,'max':48,'step':3},
 'gfs':{'label':'GFS','api':'gfs_seamless','extent':(-25,45,30,72),'spacing':2.0,'max':240,'step':12},
 'icon_eu':{'label':'ICON-EU','api':'icon_eu','extent':(-25,45,30,72),'spacing':2.0,'max':120,'step':6}}
VARS={
 'cape':{'label':'CAPE','req':['cape'],'unit':'J/kg','ticks':[0,250,500,1000,2000,3000,4000],'levels':[0,100,250,500,750,1000,1500,2000,3000,4000,5000],'cmap':'turbo'},
 'jet300':{'label':'Jet stream 300 hPa','req':['wind_speed_300hPa','wind_direction_300hPa'],'unit':'km/h','ticks':[0,50,100,150,200,250,300],'levels':list(range(0,321,20)),'cmap':'plasma'},
 'z500_mslp':{'label':'Z500 + pression','req':['geopotential_height_500hPa','pressure_msl'],'unit':'dam','ticks':[480,500,520,540,560,580,600],'levels':list(range(480,608,4)),'cmap':'turbo'},
 'anomaly_t2m':{'label':'Anomalie température 2 m','req':['temperature_2m'],'unit':'°C','ticks':[-10,-6,-3,0,3,6,10],'levels':[-12,-10,-8,-6,-4,-2,0,2,4,6,8,10,12],'cmap':'coolwarm'}}
LEG={k:{'title':v['label'],'unit':v['unit'],'ticks':v['ticks']} for k,v in VARS.items()}
LEG['anomaly_t2m']['unit']='°C par rapport à 1991–2020'
def batches(a,n):
 for i in range(0,len(a),n): yield a[i:i+n]
def points(ext,sp):
 w,e,s,n=ext; lons=np.arange(w,e+sp/2,sp); lats=np.arange(s,n+sp/2,sp); return lats,lons,[(float(la),float(lo)) for la in lats for lo in lons]
def req(batch,model,variables,days):
 p={'latitude':','.join(str(x[0]) for x in batch),'longitude':','.join(str(x[1]) for x in batch),'hourly':','.join(variables),'models':model,'forecast_days':days,'timezone':'UTC','wind_speed_unit':'kmh'}
 for a in range(4):
  try:
   r=S.get(API,params=p,timeout=180); r.raise_for_status(); j=r.json(); return j if isinstance(j,list) else [j]
  except Exception:
   if a==3: raise
   time.sleep(4*(a+1))
def fetch(c,variables):
 la,lo,p=points(c['extent'],c['spacing']); out=[]
 for b in batches(p,80): out+=req(b,c['api'],variables,math.ceil(c['max']/24)+1); time.sleep(.2)
 if len(out)!=len(p): raise RuntimeError(f'expected {len(p)}, got {len(out)}')
 return la,lo,out
def idx(loc,h):
 times=loc.get('hourly',{}).get('time',[])
 if not times:return None
 return min(range(len(times)),key=lambda i:abs(i-h))
def field(res,var,h,shape):
 vals=[]
 for loc in res:
  i=idx(loc,h); arr=loc.get('hourly',{}).get(var,[]); vals.append(np.nan if i is None or i>=len(arr) or arr[i] is None else float(arr[i]))
 return np.array(vals).reshape(shape)
def axes(ext,title,sub):
 fig=plt.figure(figsize=(14,9),dpi=110); ax=plt.axes(projection=ccrs.PlateCarree()); ax.set_extent(ext)
 ax.add_feature(cfeature.LAND,facecolor='#101827'); ax.add_feature(cfeature.OCEAN,facecolor='#07111f'); ax.add_feature(cfeature.COASTLINE,edgecolor='#dbeafe',linewidth=.55); ax.add_feature(cfeature.BORDERS,edgecolor='#94a3b8',linewidth=.35)
 fig.patch.set_facecolor('#020617'); ax.set_facecolor('#020617'); ax.set_title(title,loc='left',color='white',fontsize=18,weight='bold'); ax.set_title(sub,loc='right',color='#cbd5e1',fontsize=10); return fig,ax
def cb(fig,ax,p,ticks,unit):
 b=fig.colorbar(p,ax=ax,orientation='horizontal',pad=.035,shrink=.8); b.set_ticks(ticks); b.set_ticklabels([f'{x:g}' for x in ticks]); b.set_label(unit,color='white',weight='bold'); b.ax.tick_params(colors='white')
def save(fig,path):
 path.parent.mkdir(parents=True,exist_ok=True); fig.savefig(path,bbox_inches='tight',facecolor=fig.get_facecolor(),pil_kwargs={'quality':86,'method':6}); plt.close(fig)
def clim(root):
 p=root/'climatology/europe_t2m_monthly.json'; return json.loads(p.read_text()) if p.exists() else None
def climfield(c,la,lo,m):
 if not c:return None
 d=c.get('months',{}).get(str(m));
 if not d:return None
 return griddata(np.column_stack([d['lons'],d['lats']]),np.array(d['values']),np.meshgrid(lo,la),method='linear')
def update(root,key,data):
 p=root/'maps/manifest.json'; m=json.loads(p.read_text()) if p.exists() else {'models':{}}; m['generatedAt']=datetime.now(timezone.utc).isoformat(); e=m.setdefault('models',{}).setdefault(key,{}); e['label']=data['label']; e['run']=data['run']; variables=e.setdefault('variables',{}); variables.update(data['variables']); variables.pop('z500_mslp',None) if key=='arome' else None; p.write_text(json.dumps(m,ensure_ascii=False,indent=2))
def gen(root,key):
 if key=='arome':
  old_dir=root/'maps'/'arome'/'z500_mslp'
  if old_dir.exists(): shutil.rmtree(old_dir)
 c=MODELS[key]; requested=sorted({x for v in VARS.values() for x in v['req']}); la,lo,res=fetch(c,requested); shape=(len(la),len(lo)); X,Y=np.meshgrid(lo,la); run=datetime.now(timezone.utc).replace(minute=0,second=0,microsecond=0); cm=clim(root); vm={}
 for vk,d in VARS.items():
  if key=='arome' and vk=='z500_mslp':
   continue
  if vk=='anomaly_t2m' and not cm: continue
  fr=[]
  for h in range(0,c['max']+1,c['step']):
   valid=run+timedelta(hours=h); fig,ax=axes(c['extent'],f"{c['label']} · {d['label']}",f"Validité {valid:%Y-%m-%d %H UTC} · +{h} h")
   if vk=='cape':
    z=field(res,'cape',h,shape); p=ax.contourf(X,Y,z,levels=d['levels'],cmap=d['cmap'],extend='max',transform=ccrs.PlateCarree()); cb(fig,ax,p,d['ticks'],d['unit'])
   elif vk=='jet300':
    sp=field(res,'wind_speed_300hPa',h,shape); dr=field(res,'wind_direction_300hPa',h,shape); rad=np.deg2rad(270-dr); u=sp*np.cos(rad)/3.6; v=sp*np.sin(rad)/3.6; p=ax.contourf(X,Y,sp,levels=d['levels'],cmap=d['cmap'],extend='max',transform=ccrs.PlateCarree()); sk=max(1,len(lo)//24); ax.barbs(X[::sk,::sk],Y[::sk,::sk],u[::sk,::sk],v[::sk,::sk],length=4,linewidth=.35,color='white'); cb(fig,ax,p,d['ticks'],d['unit'])
   elif vk=='z500_mslp':
    z=field(res,'geopotential_height_500hPa',h,shape)/10; pr=field(res,'pressure_msl',h,shape); p=ax.contourf(X,Y,z,levels=d['levels'],cmap=d['cmap'],extend='both'); pl=ax.contour(X,Y,pr,levels=np.arange(960,1045,4),colors='white',linewidths=.75); ax.clabel(pl,fontsize=7,fmt='%d'); cb(fig,ax,p,d['ticks'],d['unit'])
   else:
    z=field(res,'temperature_2m',h,shape); normal=climfield(cm,la,lo,valid.month)
    if normal is None: plt.close(fig); continue
    z=z-normal; p=ax.contourf(X,Y,z,levels=d['levels'],cmap=d['cmap'],extend='both'); cb(fig,ax,p,d['ticks'],d['unit'])
   rel=Path('maps')/key/vk/f'f{h:03d}.webp'; save(fig,root/rel); fr.append({'forecastHour':h,'validTime':valid.isoformat(),'image':'./'+rel.as_posix()})
  if fr: vm[vk]={'label':d['label'],'legend':LEG[vk],'frames':fr}
 update(root,key,{'label':c['label'],'run':run.isoformat(),'variables':vm})
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--output',default='.'); ap.add_argument('--models',nargs='+',default=['ecmwf','arpege','arome']); a=ap.parse_args(); root=Path(a.output).resolve(); ok=0
 for m in a.models:
  try: gen(root,m); ok+=1
  except Exception as e: print(f'{m} failed: {e}',file=sys.stderr)
 return 0 if ok else 1
if __name__=='__main__': raise SystemExit(main())
Bibliothèque
/
render_openmeteo_models-corrige.py


#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,math,time,sys,shutil
from datetime import datetime,timedelta,timezone
from pathlib import Path
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np, requests
import cartopy.crs as ccrs, cartopy.feature as cfeature
from scipy.interpolate import griddata
API='https://api.open-meteo.com/v1/forecast'; S=requests.Session(); S.headers.update({'User-Agent':'Meteo-Lab-V8/1.0'})
MODELS={
 'ecmwf':{'label':'ECMWF IFS','api':'ecmwf_ifs025','extent':(-25,45,30,72),'spacing':2.0,'max':240,'step':12},
 'arpege':{'label':'ARPEGE','api':'meteofrance_arpege_europe','extent':(-25,45,30,72),'spacing':2.0,'max':114,'step':6},
 'arome':{'label':'AROME','api':'meteofrance_arome_france_hd','extent':(-6,10,41,52),'spacing':0.5,'max':48,'step':3},
 'gfs':{'label':'GFS','api':'gfs_seamless','extent':(-25,45,30,72),'spacing':2.0,'max':240,'step':12},
 'icon_eu':{'label':'ICON-EU','api':'icon_eu','extent':(-25,45,30,72),'spacing':2.0,'max':120,'step':6}}
VARS={
 'cape':{'label':'CAPE','req':['cape'],'unit':'J/kg','ticks':[0,250,500,1000,2000,3000,4000],'levels':[0,100,250,500,750,1000,1500,2000,3000,4000,5000],'cmap':'turbo'},
 'jet300':{'label':'Jet stream 300 hPa','req':['wind_speed_300hPa','wind_direction_300hPa'],'unit':'km/h','ticks':[0,50,100,150,200,250,300],'levels':list(range(0,321,20)),'cmap':'plasma'},
 'z500_mslp':{'label':'Z500 + pression','req':['geopotential_height_500hPa','pressure_msl'],'unit':'dam','ticks':[480,500,520,540,560,580,600],'levels':list(range(480,608,4)),'cmap':'turbo'},
 'anomaly_t2m':{'label':'Anomalie température 2 m','req':['temperature_2m'],'unit':'°C','ticks':[-10,-6,-3,0,3,6,10],'levels':[-12,-10,-8,-6,-4,-2,0,2,4,6,8,10,12],'cmap':'coolwarm'}}
LEG={k:{'title':v['label'],'unit':v['unit'],'ticks':v['ticks']} for k,v in VARS.items()}
LEG['anomaly_t2m']['unit']='°C par rapport à 1991–2020'
def batches(a,n):
 for i in range(0,len(a),n): yield a[i:i+n]
def points(ext,sp):
 w,e,s,n=ext; lons=np.arange(w,e+sp/2,sp); lats=np.arange(s,n+sp/2,sp); return lats,lons,[(float(la),float(lo)) for la in lats for lo in lons]
def req(batch,model,variables,days):
 p={'latitude':','.join(str(x[0]) for x in batch),'longitude':','.join(str(x[1]) for x in batch),'hourly':','.join(variables),'models':model,'forecast_days':days,'timezone':'UTC','wind_speed_unit':'kmh'}
 for a in range(4):
  try:
   r=S.get(API,params=p,timeout=180); r.raise_for_status(); j=r.json(); return j if isinstance(j,list) else [j]
  except Exception:
   if a==3: raise
   time.sleep(4*(a+1))
def fetch(c,variables):
 la,lo,p=points(c['extent'],c['spacing']); out=[]
 for b in batches(p,80): out+=req(b,c['api'],variables,math.ceil(c['max']/24)+1); time.sleep(.2)
 if len(out)!=len(p): raise RuntimeError(f'expected {len(p)}, got {len(out)}')
 return la,lo,out
def idx(loc,h):
 times=loc.get('hourly',{}).get('time',[])
 if not times:return None
 return min(range(len(times)),key=lambda i:abs(i-h))
def field(res,var,h,shape):
 vals=[]
 for loc in res:
  i=idx(loc,h); arr=loc.get('hourly',{}).get(var,[]); vals.append(np.nan if i is None or i>=len(arr) or arr[i] is None else float(arr[i]))
 return np.array(vals).reshape(shape)
def axes(ext,title,sub):
 fig=plt.figure(figsize=(14,9),dpi=110); ax=plt.axes(projection=ccrs.PlateCarree()); ax.set_extent(ext)
 ax.add_feature(cfeature.LAND,facecolor='#101827'); ax.add_feature(cfeature.OCEAN,facecolor='#07111f'); ax.add_feature(cfeature.COASTLINE,edgecolor='#dbeafe',linewidth=.55); ax.add_feature(cfeature.BORDERS,edgecolor='#94a3b8',linewidth=.35)
 fig.patch.set_facecolor('#020617'); ax.set_facecolor('#020617'); ax.set_title(title,loc='left',color='white',fontsize=18,weight='bold'); ax.set_title(sub,loc='right',color='#cbd5e1',fontsize=10); return fig,ax
def cb(fig,ax,p,ticks,unit):
 b=fig.colorbar(p,ax=ax,orientation='horizontal',pad=.035,shrink=.8); b.set_ticks(ticks); b.set_ticklabels([f'{x:g}' for x in ticks]); b.set_label(unit,color='white',weight='bold'); b.ax.tick_params(colors='white')
def save(fig,path):
 path.parent.mkdir(parents=True,exist_ok=True); fig.savefig(path,bbox_inches='tight',facecolor=fig.get_facecolor(),pil_kwargs={'quality':86,'method':6}); plt.close(fig)
def clim(root):
 p=root/'climatology/europe_t2m_monthly.json'; return json.loads(p.read_text()) if p.exists() else None
def climfield(c,la,lo,m):
 if not c:return None
 d=c.get('months',{}).get(str(m));
 if not d:return None
 return griddata(np.column_stack([d['lons'],d['lats']]),np.array(d['values']),np.meshgrid(lo,la),method='linear')
def update(root,key,data):
 p=root/'maps/manifest.json'; m=json.loads(p.read_text()) if p.exists() else {'models':{}}; m['generatedAt']=datetime.now(timezone.utc).isoformat(); e=m.setdefault('models',{}).setdefault(key,{}); e['label']=data['label']; e['run']=data['run']; variables=e.setdefault('variables',{}); variables.update(data['variables']); variables.pop('z500_mslp',None) if key=='arome' else None; p.write_text(json.dumps(m,ensure_ascii=False,indent=2))
def gen(root,key):
 if key=='arome':
  old_dir=root/'maps'/'arome'/'z500_mslp'
  if old_dir.exists(): shutil.rmtree(old_dir)
 c=MODELS[key]; requested=sorted({x for v in VARS.values() for x in v['req']}); la,lo,res=fetch(c,requested); shape=(len(la),len(lo)); X,Y=np.meshgrid(lo,la); run=datetime.now(timezone.utc).replace(minute=0,second=0,microsecond=0); cm=clim(root); vm={}
 for vk,d in VARS.items():
  if key=='arome' and vk=='z500_mslp':
   continue
  if vk=='anomaly_t2m' and not cm: continue
  fr=[]
  for h in range(0,c['max']+1,c['step']):
   valid=run+timedelta(hours=h); fig,ax=axes(c['extent'],f"{c['label']} · {d['label']}",f"Validité {valid:%Y-%m-%d %H UTC} · +{h} h")
   if vk=='cape':
    z=field(res,'cape',h,shape); p=ax.contourf(X,Y,z,levels=d['levels'],cmap=d['cmap'],extend='max',transform=ccrs.PlateCarree()); cb(fig,ax,p,d['ticks'],d['unit'])
   elif vk=='jet300':
    sp=field(res,'wind_speed_300hPa',h,shape); dr=field(res,'wind_direction_300hPa',h,shape); rad=np.deg2rad(270-dr); u=sp*np.cos(rad)/3.6; v=sp*np.sin(rad)/3.6; p=ax.contourf(X,Y,sp,levels=d['levels'],cmap=d['cmap'],extend='max',transform=ccrs.PlateCarree()); sk=max(1,len(lo)//24); ax.barbs(X[::sk,::sk],Y[::sk,::sk],u[::sk,::sk],v[::sk,::sk],length=4,linewidth=.35,color='white'); cb(fig,ax,p,d['ticks'],d['unit'])
   elif vk=='z500_mslp':
    z=field(res,'geopotential_height_500hPa',h,shape)/10; pr=field(res,'pressure_msl',h,shape); p=ax.contourf(X,Y,z,levels=d['levels'],cmap=d['cmap'],extend='both'); pl=ax.contour(X,Y,pr,levels=np.arange(960,1045,4),colors='white',linewidths=.75); ax.clabel(pl,fontsize=7,fmt='%d'); cb(fig,ax,p,d['ticks'],d['unit'])
   else:
    z=field(res,'temperature_2m',h,shape); normal=climfield(cm,la,lo,valid.month)
    if normal is None: plt.close(fig); continue
    z=z-normal; p=ax.contourf(X,Y,z,levels=d['levels'],cmap=d['cmap'],extend='both'); cb(fig,ax,p,d['ticks'],d['unit'])
   rel=Path('maps')/key/vk/f'f{h:03d}.webp'; save(fig,root/rel); fr.append({'forecastHour':h,'validTime':valid.isoformat(),'image':'./'+rel.as_posix()})
  if fr: vm[vk]={'label':d['label'],'legend':LEG[vk],'frames':fr}
 update(root,key,{'label':c['label'],'run':run.isoformat(),'variables':vm})
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--output',default='.'); ap.add_argument('--models',nargs='+',default=['ecmwf','arpege','arome']); a=ap.parse_args(); root=Path(a.output).resolve(); ok=0
 for m in a.models:
  try: gen(root,m); ok+=1
  except Exception as e: print(f'{m} failed: {e}',file=sys.stderr)
 return 0 if ok else 1
if __name__=='__main__': raise SystemExit(main())
