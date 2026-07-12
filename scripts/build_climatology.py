#!/usr/bin/env python3
import argparse,json,time
from pathlib import Path
import numpy as np, requests
API='https://archive-api.open-meteo.com/v1/archive'; S=requests.Session(); S.headers.update({'User-Agent':'Meteo-Lab-V8-Climatology/1.0'})
def chunks(a,n):
 for i in range(0,len(a),n): yield a[i:i+n]
def get(batch):
 p={'latitude':','.join(str(x[0]) for x in batch),'longitude':','.join(str(x[1]) for x in batch),'start_date':'1991-01-01','end_date':'2020-12-31','daily':'temperature_2m_mean','timezone':'UTC'}
 for a in range(4):
  try:
   r=S.get(API,params=p,timeout=240); r.raise_for_status(); j=r.json(); return j if isinstance(j,list) else [j]
  except Exception:
   if a==3: raise
   time.sleep(5*(a+1))
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--output',default='climatology/europe_t2m_monthly.json'); a=ap.parse_args(); lats=np.arange(30,72.1,3); lons=np.arange(-24,45.1,3); pts=[(float(x),float(y)) for x in lats for y in lons]; out=[]
 for b in chunks(pts,25): out+=get(b); time.sleep(.4)
 months={str(m):{'lats':[],'lons':[],'values':[]} for m in range(1,13)}
 for (la,lo),loc in zip(pts,out):
  buck={m:[] for m in range(1,13)}
  for d,v in zip(loc['daily']['time'],loc['daily']['temperature_2m_mean']):
   if v is not None: buck[int(d[5:7])].append(float(v))
  for m in range(1,13):
   if buck[m]: months[str(m)]['lats'].append(la); months[str(m)]['lons'].append(lo); months[str(m)]['values'].append(sum(buck[m])/len(buck[m]))
 p=Path(a.output); p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps({'period':'1991-2020','months':months},ensure_ascii=False)); print(p)
if __name__=='__main__': main()
