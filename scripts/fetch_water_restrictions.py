#!/usr/bin/env python3
from __future__ import annotations
import json, math, os, sys, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'data/water-restrictions.json'
CONFIG=ROOT/'data/location.json'
API='https://api.vigieau.gouv.fr/api/zones'
LEVEL_ORDER={'crise':5,'alerte_renforcee':4,'alerte':3,'vigilance':2,'aucune':1,None:0}
LEVEL_LABELS={'crise':'Crise','alerte_renforcee':'Alerte renforcée','alerte':'Alerte','vigilance':'Vigilance','aucune':'Aucune restriction',None:'Situation inconnue'}
ZONE_LABELS={'AEP':'Eau du réseau potable','SUP':'Eaux superficielles','SOU':'Eaux souterraines'}
def finite(v):
    try:return math.isfinite(float(v))
    except:return False
def location():
    if finite(os.getenv('SITE_LATITUDE')) and finite(os.getenv('SITE_LONGITUDE')):
        return {'latitude':float(os.getenv('SITE_LATITUDE')),'longitude':float(os.getenv('SITE_LONGITUDE')),'name':os.getenv('SITE_NAME') or 'Zone du site','insee':os.getenv('SITE_INSEE') or None}
    if CONFIG.exists():
        d=json.loads(CONFIG.read_text(encoding='utf-8'))
        if finite(d.get('latitude')) and finite(d.get('longitude')):
            return {'latitude':float(d['latitude']),'longitude':float(d['longitude']),'name':d.get('name') or d.get('city') or 'Zone du site','insee':d.get('insee')}
    return {'latitude':46.2006,'longitude':-0.3194,'name':'Brûlain','insee':'79058'}
def zones(payload):
    if isinstance(payload,list): return [x for x in payload if isinstance(x,dict)]
    if isinstance(payload,dict):
        for k in ('zones','data','results'):
            if isinstance(payload.get(k),list): return [x for x in payload[k] if isinstance(x,dict)]
        if payload.get('niveauGravite') or payload.get('usages'): return [payload]
    return []
def normalize(z):
    a=z.get('arrete') if isinstance(z.get('arrete'),dict) else {}
    us=z.get('usages') if isinstance(z.get('usages'),list) else []
    return {'id':z.get('id'),'code':z.get('code'),'name':z.get('nom') or "Zone d'alerte",'type':z.get('type'),'typeLabel':ZONE_LABELS.get(z.get('type'),z.get('type') or 'Type inconnu'),'level':z.get('niveauGravite'),'levelLabel':LEVEL_LABELS.get(z.get('niveauGravite'),str(z.get('niveauGravite') or 'Situation inconnue').replace('_',' ').title()),'department':z.get('departement'),'decree':{'id':a.get('id'),'startDate':a.get('dateDebutValidite'),'endDate':a.get('dateFinValidite'),'url':a.get('cheminFichier'),'frameworkUrl':a.get('cheminFichierArreteCadre')},'usages':[{'name':u.get('nom') or "Usage de l'eau",'theme':u.get('thematique') or 'Autre usage','description':(u.get('description') or '').strip()} for u in us if isinstance(u,dict)]}
def write(d):
    OUTPUT.parent.mkdir(parents=True,exist_ok=True); t=OUTPUT.with_suffix('.json.tmp'); t.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); t.replace(OUTPUT)
def main():
    l=location(); now=datetime.now(timezone.utc).isoformat(); q=urllib.parse.urlencode({'lat':l['latitude'],'lon':l['longitude'],'commune':l.get('insee'),'profil':'particulier'})
    try:
        req=urllib.request.Request(API+'?'+q,headers={'Accept':'application/json','User-Agent':'Meteo-Lab-V19/1.0'})
        with urllib.request.urlopen(req,timeout=30) as r: raw=json.loads(r.read().decode('utf-8'))
        zz=[normalize(z) for z in zones(raw)]; zz.sort(key=lambda x:LEVEL_ORDER.get(x.get('level'),0),reverse=True)
        write({'status':'ok','source':'VigiEau','sourceUrl':'https://vigieau.gouv.fr/','generatedAt':now,'location':l,'highestLevel':zz[0]['level'] if zz else 'aucune','highestLevelLabel':zz[0]['levelLabel'] if zz else 'Aucune restriction publiée','zones':zz,'notice':"Informations fournies à titre indicatif. L'arrêté préfectoral fait foi."}); print(f'{len(zz)} zone(s) VigiEau'); return 0
    except urllib.error.HTTPError as e:
        if e.code==404:
            write({'status':'ok','source':'VigiEau','sourceUrl':'https://vigieau.gouv.fr/','generatedAt':now,'location':l,'highestLevel':'aucune','highestLevelLabel':'Aucune restriction publiée','zones':[],'notice':"Informations fournies à titre indicatif. L'arrêté préfectoral fait foi."}); return 0
        err=f'HTTP {e.code}: {e.reason}'
    except Exception as e: err=str(e)
    try: old=json.loads(OUTPUT.read_text(encoding='utf-8'))
    except: old=None
    if old:
        old.update({'status':'stale','lastError':err,'lastAttemptAt':now}); write(old); print('Dernière donnée valide conservée',file=sys.stderr); return 0
    write({'status':'unavailable','source':'VigiEau','sourceUrl':'https://vigieau.gouv.fr/','generatedAt':now,'location':l,'highestLevel':None,'highestLevelLabel':'Données temporairement indisponibles','zones':[],'lastError':err,'notice':"Informations fournies à titre indicatif. L'arrêté préfectoral fait foi."}); return 0
if __name__=='__main__': raise SystemExit(main())
