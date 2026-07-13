#!/usr/bin/env python3
import json
from datetime import datetime,timezone
from pathlib import Path
import requests
LOC={'name':'Brûlain','latitude':46.2025,'longitude':-0.3297}
S=requests.Session(); S.headers.update({'User-Agent':'Meteo-Lab-V16/1.0'})
def get(url,params=None):
 r=S.get(url,params=params,timeout=90); r.raise_for_status(); return r.json()
def main():
 out={'generatedAt':datetime.now(timezone.utc).isoformat(),'location':LOC,'radar':None,'weather':None,'alerts':[],'providers':{},'errors':[]}
 try:
  out['radar']=get('https://api.rainviewer.com/public/weather-maps.json'); out['providers']['radar']={'status':'ok'}
 except Exception as e: out['providers']['radar']={'status':'error','message':str(e)}; out['errors'].append('radar: '+str(e))
 try:
  p={'latitude':LOC['latitude'],'longitude':LOC['longitude'],'timezone':'Europe/Paris','forecast_days':3,'current':'temperature_2m,relative_humidity_2m,precipitation,cloud_cover,surface_pressure,wind_speed_10m,wind_gusts_10m','hourly':'temperature_2m,precipitation,wind_gusts_10m,cape'}
  out['weather']=get('https://api.open-meteo.com/v1/forecast',p); out['providers']['weather']={'status':'ok'}
 except Exception as e: out['providers']['weather']={'status':'error','message':str(e)}; out['errors'].append('weather: '+str(e))
 h=(out.get('weather') or {}).get('hourly',{}); alerts=[]
 def vals(k): return [x for x in h.get(k,[])[:24] if isinstance(x,(int,float))]
 g,r,c,t=vals('wind_gusts_10m'),vals('precipitation'),vals('cape'),vals('temperature_2m')
 if g and max(g)>=80: alerts.append({'type':'wind','level':'high','title':'Rafales fortes','detail':f'Maximum {max(g):.0f} km/h sur 24 h.'})
 elif g and max(g)>=60: alerts.append({'type':'wind','level':'medium','title':'Vent soutenu','detail':f'Maximum {max(g):.0f} km/h sur 24 h.'})
 if r and sum(r)>=20: alerts.append({'type':'rain','level':'high','title':'Pluie notable','detail':f'Cumul {sum(r):.0f} mm sur 24 h.'})
 elif r and sum(r)>=10: alerts.append({'type':'rain','level':'medium','title':'Pluie à surveiller','detail':f'Cumul {sum(r):.0f} mm sur 24 h.'})
 if c and max(c)>=1500: alerts.append({'type':'storm','level':'high','title':'Instabilité élevée','detail':f'CAPE {max(c):.0f} J/kg.'})
 elif c and max(c)>=800: alerts.append({'type':'storm','level':'medium','title':'Risque orageux','detail':f'CAPE {max(c):.0f} J/kg.'})
 if t and min(t)<=0: alerts.append({'type':'frost','level':'medium','title':'Risque de gel','detail':f'Minimum {min(t):.1f} °C.'})
 if t and max(t)>=35: alerts.append({'type':'heat','level':'high','title':'Forte chaleur','detail':f'Maximum {max(t):.1f} °C.'})
 if not alerts: alerts=[{'type':'ok','level':'low','title':'Aucun signal majeur','detail':'Aucun seuil automatique dépassé sur 24 h.'}]
 out['alerts']=alerts; Path('surveillance/data.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8'); return 0
if __name__=='__main__': raise SystemExit(main())
