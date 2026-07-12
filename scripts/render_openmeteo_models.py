#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,math,time,sys
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
 p=root/'maps/manifest.json'; m=json.loads(p.read_text()) if p.exists() else {'models':{}}; m['generatedAt']=datetime.now(timezone.utc).isoformat(); e=m.setdefault('models',{}).setdefault(key,{}); e['label']=data['label']; e['run']=data['run']; e.setdefault('variables',{}).update(data['variables']); p.write_text(json.dumps(m,ensure_ascii=False,indent=2))
def gen(root,key):
 c=MODELS[key]; requested=sorted({x for v in VARS.values() for x in v['req']}); la,lo,res=fetch(c,requested); shape=(len(la),len(lo)); X,Y=np.meshgrid(lo,la); run=datetime.now(timezone.utc).replace(minute=0,second=0,microsecond=0); cm=clim(root); vm={}
 for vk,d in VARS.items():
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
