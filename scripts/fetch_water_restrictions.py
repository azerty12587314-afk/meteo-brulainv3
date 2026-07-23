#!/usr/bin/env python3
from __future__ import annotations
import json, math, os, sys, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/water-restrictions.json'
LOC=ROOT/'data/location.json'
API='https://api.vigieau.beta.gouv.fr/api/zones'
LABELS={'crise':'Crise','alerte_renforcee':'Alerte renforcée','alerte':'Alerte','vigilance':'Vigilance','aucune':'Aucune restriction publiée'}
ORDER={'crise':5,'alerte_renforcee':4,'alerte':3,'vigilance':2,'aucune':1,None:0}
TYPES={'AEP':'Eau du réseau potable','SUP':'Eaux superficielles','SOU':'Eaux souterraines'}

def valid(v):
    try:return math.isfinite(float(v))
    except (TypeError,ValueError):return False

def location():
    cfg=json.loads(LOC.read_text(encoding='utf-8')) if LOC.exists() else {}
    lat=os.getenv('SITE_LATITUDE',cfg.get('latitude'))
    lon=os.getenv('SITE_LONGITUDE',cfg.get('longitude'))
    if not valid(lat) or not valid(lon): raise ValueError('Coordonnées invalides')
    return {'name':os.getenv('SITE_NAME') or cfg.get('name') or 'Zone du site','latitude':float(lat),'longitude':float(lon),'insee':os.getenv('SITE_INSEE') or cfg.get('insee')}

def request(loc):
    q=urllib.parse.urlencode({'lat':loc['latitude'],'lon':loc['longitude'],'profil':'particulier'})
    req=urllib.request.Request(f'{API}?{q}',headers={'Accept':'application/json','User-Agent':'Meteo-Lab-V19/1.0'})
    with urllib.request.urlopen(req,timeout=35) as r:return json.loads(r.read().decode('utf-8'))

def array(payload):
    if isinstance(payload,list):return payload
    if isinstance(payload,dict):
        for k in ('zones','data','results'):
            if isinstance(payload.get(k),list):return payload[k]
        return [payload] if payload else []
    return []

def usages(z):
    raw=z.get('usages') or z.get('restrictions') or []
    return [{'name':u.get('nom') or u.get('name') or 'Usage de l’eau','theme':u.get('thematique') or u.get('theme') or 'Usage','description':(u.get('description') or u.get('mesure') or '').strip()} for u in raw if isinstance(u,dict)]

def zone(z):
    a=z.get('arrete') if isinstance(z.get('arrete'),dict) else {}
    level=z.get('niveauGravite') or z.get('niveau_gravite') or z.get('niveau')
    typ=z.get('type') or z.get('typeEau')
    return {'id':z.get('id'),'name':z.get('nom') or z.get('name') or "Zone d’alerte",'type':typ,'typeLabel':TYPES.get(typ,typ or "Type d’eau non précisé"),'level':level,'levelLabel':LABELS.get(level,str(level or 'Situation inconnue').replace('_',' ').title()),'department':z.get('departement') or z.get('department'),'decree':{'startDate':a.get('dateDebutValidite') or z.get('dateDebutValidite'),'endDate':a.get('dateFinValidite') or z.get('dateFinValidite'),'url':a.get('cheminFichier') or z.get('cheminFichier'),'frameworkUrl':a.get('cheminFichierArreteCadre') or z.get('cheminFichierArreteCadre')},'usages':usages(z)}

def write(payload):
    OUT.parent.mkdir(exist_ok=True); tmp=OUT.with_suffix('.tmp'); tmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); tmp.replace(OUT)

def main():
    loc=location(); now=datetime.now(timezone.utc).isoformat()
    try:
        zones=[zone(z) for z in array(request(loc)) if isinstance(z,dict)]
        zones.sort(key=lambda z:ORDER.get(z.get('level'),0),reverse=True)
        highest=zones[0]['level'] if zones else 'aucune'
        write({'status':'ok','source':'VigiEau','sourceUrl':'https://vigieau.gouv.fr/','generatedAt':now,'location':loc,'highestLevel':highest,'highestLevelLabel':zones[0]['levelLabel'] if zones else LABELS['aucune'],'zones':zones,'notice':"Informations indicatives : l’arrêté préfectoral fait foi."})
        print(f'VigiEau: {len(zones)} zone(s) enregistrée(s).'); return 0
    except Exception as e:
        try: old=json.loads(OUT.read_text(encoding='utf-8'))
        except Exception: old=None
        if old and old.get('status')!='pending':
            old.update({'status':'stale','lastAttemptAt':now,'lastError':str(e)}); write(old); print('VigiEau indisponible, dernière donnée conservée.',file=sys.stderr); return 0
        write({'status':'unavailable','source':'VigiEau','generatedAt':now,'location':loc,'highestLevel':None,'highestLevelLabel':'Données temporairement indisponibles','zones':[],'lastError':str(e),'notice':"Informations indicatives : l’arrêté préfectoral fait foi."}); print(e,file=sys.stderr); return 0
if __name__=='__main__': raise SystemExit(main())
