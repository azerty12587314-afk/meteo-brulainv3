#!/usr/bin/env python3
from __future__ import annotations
import calendar,json,math,time
from collections import defaultdict
from datetime import date,datetime,timezone
from pathlib import Path
import requests
API='https://archive-api.open-meteo.com/v1/archive'
LOC={'name':'Brûlain','latitude':46.2025,'longitude':-0.3297,'timezone':'Europe/Paris'}
V=['temperature_2m_max','temperature_2m_min','temperature_2m_mean','precipitation_sum','sunshine_duration','et0_fao_evapotranspiration','wind_gusts_10m_max']
S=requests.Session(); S.headers.update({'User-Agent':'Meteo-Lab-V15 climate builder'})
def get(a,b):
 p={'latitude':LOC['latitude'],'longitude':LOC['longitude'],'start_date':a,'end_date':b,'daily':','.join(V),'timezone':LOC['timezone'],'models':'era5_land'}
 last=None
 for n in range(6):
  try:
   r=S.get(API,params=p,timeout=180)
   if r.status_code==429:
    w=int(r.headers.get('Retry-After','0') or 0) or min(300,30*(2**n)); print('429',a,b,w); time.sleep(w); continue
   r.raise_for_status(); return r.json()
  except Exception as e:
   last=e
   if n==5: break
   time.sleep(min(120,10*(n+1)))
 raise RuntimeError(f'{a}-{b}: {last}')
def rows(j):
 d=j.get('daily',{}); out=[]
 for i,day in enumerate(d.get('time',[])):
  x={'date':day}
  for k in V:
   arr=d.get(k,[]); x[k]=arr[i] if i<len(arr) else None
  out.append(x)
 return out
def num(x,k):
 try:
  v=float(x.get(k)); return v if math.isfinite(v) else math.nan
 except: return math.nan
def mean(a):
 a=[x for x in a if math.isfinite(x)]; return sum(a)/len(a) if a else None
def summ(a): return sum(x for x in a if math.isfinite(x))
def monthly(rs):
 by=defaultdict(list)
 for x in rs: by[int(x['date'][5:7])].append(x)
 o=[]
 for m in range(1,13):
  a=by[m]
  o.append({'month':m,'label':calendar.month_abbr[m],'temperatureMean':mean([num(x,'temperature_2m_mean') for x in a]),'temperatureMaxMean':mean([num(x,'temperature_2m_max') for x in a]),'temperatureMinMean':mean([num(x,'temperature_2m_min') for x in a]),'precipitation':summ([num(x,'precipitation_sum') for x in a]),'sunshineHours':summ([num(x,'sunshine_duration')/3600 for x in a]),'evapotranspiration':summ([num(x,'et0_fao_evapotranspiration') for x in a]),'frostDays':sum(num(x,'temperature_2m_min')<0 for x in a),'summerDays':sum(num(x,'temperature_2m_max')>=25 for x in a),'hotDays':sum(num(x,'temperature_2m_max')>=30 for x in a)})
 return o
def normals(rs):
 ym=defaultdict(list)
 for x in rs: ym[(int(x['date'][:4]),int(x['date'][5:7]))].append(x)
 agg=defaultdict(list)
 for (_,m),a in ym.items(): agg[m].append(monthly(a)[m-1])
 out=[]
 for m in range(1,13):
  a=agg[m]
  out.append({'month':m,'label':calendar.month_abbr[m],**{k:mean([float(x[k]) for x in a if x.get(k) is not None]) for k in ['temperatureMean','temperatureMaxMean','temperatureMinMean','precipitation','sunshineHours','evapotranspiration','frostDays','summerDays','hotDays']}})
 return out
def annual(y,rs):
 tm=[num(x,'temperature_2m_mean') for x in rs]
 return {'year':y,'temperatureMean':mean(tm),'precipitation':summ([num(x,'precipitation_sum') for x in rs]),'sunshineHours':summ([num(x,'sunshine_duration')/3600 for x in rs]),'evapotranspiration':summ([num(x,'et0_fao_evapotranspiration') for x in rs]),'frostDays':sum(num(x,'temperature_2m_min')<0 for x in rs),'summerDays':sum(num(x,'temperature_2m_max')>=25 for x in rs),'hotDays':sum(num(x,'temperature_2m_max')>=30 for x in rs),'rainDays':sum(num(x,'precipitation_sum')>=1 for x in rs),'heatingDegreeDays':summ([max(0,18-x) for x in tm if math.isfinite(x)]),'monthly':monthly(rs)}
def rec(rs,k,mx=True):
 a=[(num(x,k),x['date']) for x in rs if math.isfinite(num(x,k))]
 if not a:return None
 v,d=(max(a) if mx else min(a)); return {'value':v,'date':d}
def main():
 cy=date.today().year; errors=[]; nr=[]
 for a,b in [('1991-01-01','2000-12-31'),('2001-01-01','2010-12-31'),('2011-01-01','2020-12-31')]:
  try:nr+=rows(get(a,b));time.sleep(4)
  except Exception as e:errors.append(str(e))
 recent=[]; rr=[]
 for y in range(max(2021,cy-5),cy+1):
  try:
   r=rows(get(f'{y}-01-01',date.today().isoformat() if y==cy else f'{y}-12-31')); rr+=r; recent.append(annual(y,r));time.sleep(2)
  except Exception as e:errors.append(str(e))
 out={'generatedAt':datetime.now(timezone.utc).isoformat(),'location':LOC,'normalPeriod':'1991-2020','normals':{'monthly':normals(nr) if nr else []},'currentYear':recent[-1] if recent and recent[-1]['year']==cy else None,'recentYears':recent,'records':{'highestTemperature':rec(nr+rr,'temperature_2m_max',True),'lowestTemperature':rec(nr+rr,'temperature_2m_min',False),'wettestDay':rec(nr+rr,'precipitation_sum',True),'strongestGust':rec(nr+rr,'wind_gusts_10m_max',True)},'errors':errors}
 Path('data/climate.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(out,ensure_ascii=False,indent=2)); return 0 if out['normals']['monthly'] or recent else 1
if __name__=='__main__': raise SystemExit(main())
