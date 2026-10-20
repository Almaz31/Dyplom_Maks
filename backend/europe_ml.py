"""Pooled direct multi-horizon models with strictly chronological features."""
import calendar
import gzip
import json
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT=Path(__file__).resolve().parents[1]
METRICS=('temperature','precipitation','humidity','wind')
LABELS={'mean':'Сезонне середнє 10 років','trend':'Сезонний тренд 20 років','ridge':'Ridge · багатофакторна модель','boosting':'Градієнтний бустинг','ridge_trend':'Сезонний тренд + Ridge аномалій','temporal':'Тренд + авторегресія відхилень'}


def load_full():
    with gzip.open(ROOT/'samples/europe-weather-full.json.gz','rt',encoding='utf-8') as f:return json.load(f)


def load_observed():
    with gzip.open(ROOT/'samples/europe-weather-observed.json.gz','rt',encoding='utf-8') as f:return json.load(f)


def load_snapshot(cutoff):
    data=load_full()
    if cutoff==2018:return data
    observed=load_observed()
    if [p['id'] for p in data['points']]!=[p['id'] for p in observed['points']]:raise ValueError('Observation grid differs from training grid')
    for target,extra in [(data,observed),*zip(data['points'],observed['points'])]:
        for key in ('monthly','series'):target[key]+= [r for r in extra[key] if r['year']<=cutoff]
    if data['series'][-1]['year']!=cutoff:raise ValueError('Incomplete training snapshot')
    data['end']=cutoff
    return data


def cube_from(data):
    years=len(data['points'][0]['monthly'])//12
    return np.asarray([[[[row[m] for m in METRICS] for row in p['monthly'][y*12:(y+1)*12]] for y in range(years)] for p in data['points']],dtype=np.float32)


def features(cube,points,origin,lead):
    """Only observations ending at origin; no recursive invented weather inputs."""
    if origin<10:raise ValueError('At least 11 historical years required')
    window=cube[:,max(0,origin-19):origin+1]
    years=np.arange(window.shape[1],dtype=np.float32);years-=years.mean()
    mean=window.mean(axis=1)
    slope=(window*years[None,:,None,None]).sum(axis=1)/(years**2).sum()
    recent=cube[:,origin-9:origin+1].mean(axis=1)
    trend=mean+slope*((window.shape[1]-1)/2+lead)
    season=np.arange(12,dtype=np.float32)*2*np.pi/12
    lat=np.asarray([p['lat'] for p in points],dtype=np.float32)[:,None].repeat(12,axis=1)
    lon=np.asarray([p['lon'] for p in points],dtype=np.float32)[:,None].repeat(12,axis=1)
    geographic=np.stack([lat,lon,np.broadcast_to(np.sin(season),lat.shape),np.broadcast_to(np.cos(season),lat.shape),np.full_like(lat,lead)],axis=-1)
    blocks=[geographic,recent,cube[:,origin],cube[:,origin-4:origin+1].mean(axis=1),
            cube[:,origin-9:origin+1].std(axis=1),slope*lead,trend-recent]
    x=np.concatenate(blocks,axis=-1).reshape(-1,29)
    return x,recent.reshape(-1,4),trend.reshape(-1,4)


def training_matrix(cube,points,cutoff,baseline_kind='mean'):
    end=cutoff-1981;xs=[];ys=[]
    for origin in range(10,end,2):
        for lead in (1,3,5,8,10,12):
            if origin+lead>end:continue
            x,baseline,trend=features(cube,points,origin,lead)
            if baseline_kind=='trend':baseline=trend
            xs.append(x);ys.append(cube[:,origin+lead].reshape(-1,4)-baseline)
    if not xs:raise ValueError('Insufficient chronological training rows')
    x=np.concatenate(xs);y=np.concatenate(ys)
    return x,y


def new_model(kind):
    if kind in ('ridge','ridge_trend'):return make_pipeline(StandardScaler(),Ridge(alpha=100.))
    return HistGradientBoostingRegressor(max_iter=80,max_leaf_nodes=15,min_samples_leaf=40,learning_rate=.06,l2_regularization=5,early_stopping=False,random_state=42)


def physical(values):
    result=values.copy();result[...,1]=np.maximum(0,result[...,1]);result[...,2]=np.clip(result[...,2],0,100);result[...,3]=np.maximum(0,result[...,3]);return result


def temporal_forecast(cube,origin,lead):
    """Fit a trend and stable ridge AR(2) to each cell/month/metric's past only.

    Forecasts are conditional means, not invented future weather or random spikes.
    L1 coefficient bound ensures residual dynamics contract instead of exploding.
    """
    window=cube[:,max(0,origin-19):origin+1].astype(np.float64)
    t=np.arange(window.shape[1],dtype=float);t-=t.mean()
    mean=window.mean(axis=1);slope=(window*t[None,:,None,None]).sum(axis=1)/(t*t).sum()
    residual=window-mean[:,None]-slope[:,None]*t[None,:,None,None]
    x1=residual[:,1:-1];x2=residual[:,:-2];target=residual[:,2:]
    penalty=2*np.maximum(residual.var(axis=1),1e-8)
    a=(x1*x1).sum(axis=1)+penalty;b=(x1*x2).sum(axis=1);c=(x2*x2).sum(axis=1)+penalty
    d=(x1*target).sum(axis=1);e=(x2*target).sum(axis=1);det=a*c-b*b
    phi1=(d*c-e*b)/det;phi2=(e*a-d*b)/det
    shrink=np.maximum(1,(np.abs(phi1)+np.abs(phi2))/.98);phi1/=shrink;phi2/=shrink
    previous,last=residual[:,-2],residual[:,-1]
    for _ in range(lead):previous,last=last,phi1*last+phi2*previous
    return physical(mean+slope*((window.shape[1]-1)/2+lead)+last)


def predict(models,cube,points,origin,lead):
    x,baseline,trend=features(cube,points,origin-1981,lead)
    output={'mean':physical(baseline),'trend':physical(trend),'temporal':temporal_forecast(cube,origin-1981,lead).reshape(-1,4)}
    for kind in ('ridge','boosting','ridge_trend'):
        if kind not in models:continue
        residual=np.column_stack([m.predict(x) for m in models[kind]])
        output[kind]=physical((trend if kind=='ridge_trend' else baseline)+residual)
    return {kind:value.reshape(len(points),12,4) for kind,value in output.items()}


def period(values,month,year):
    if month:return values[:,month-1,:]
    days=np.asarray([calendar.monthrange(year,m)[1] for m in range(1,13)])
    result=(values*days[None,:,None]).sum(axis=1)/days.sum();result[:,1]=values[:,:,1].sum(axis=1);return result
