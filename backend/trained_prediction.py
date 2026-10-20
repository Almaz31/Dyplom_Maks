"""Serve audited pre-trained European models; no re-fitting on each button click."""
import hashlib
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import HTTPException

from .europe_ml import load_snapshot,load_observed,cube_from,features,physical,period,temporal_forecast,METRICS,LABELS

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'samples/europe_models'


@lru_cache(maxsize=2)
def artifacts(cutoff):
    directory=ART/'updated' if cutoff==2025 else ART
    if not (directory/'report.json').exists():raise HTTPException(503,'Спочатку запустіть скрипт навчання моделей Європи')
    report=json.loads((directory/'report.json').read_text(encoding='utf-8'))
    fingerprint=hashlib.sha256((ROOT/'samples/europe-weather-full.json.gz').read_bytes()).hexdigest()
    if fingerprint!=report['fingerprint']:raise HTTPException(503,'Дані змінилися. Потрібно повторити навчання моделей Європи.')
    if cutoff==2025:
        observed_hash=hashlib.sha256((ROOT/'samples/europe-weather-observed.json.gz').read_bytes()).hexdigest()
        if observed_hash!=report['observed_fingerprint']:raise HTTPException(503,'Нові спостереження потребують повторного навчання оновленої моделі')
    data=load_snapshot(cutoff)
    with np.load(directory/'forecasts.npz') as f:arrays={k:f[k] for k in f.files}
    return data,report,arrays


@lru_cache(maxsize=32)
def prediction(year,month,cutoff=2018,compact=False,point_id=None,method='auto'):
    if cutoff not in (2018,2025) or not cutoff<year<=2030:raise HTTPException(422,'Рік прогнозу має бути пізнішим за кінець навчання')
    data,report,arrays=artifacts(cutoff);points=data['points'];h=year-cutoff;index=(h-1)*13+month
    targets=report['validation_targets'];test_indices=[targets.index(t) for t in report['evaluation_targets']];cal_indices=[targets.index(t) for t in report['calibration_targets']]
    observations=load_observed() if not compact and (ROOT/'samples/europe-weather-observed.json.gz').exists() else None
    score=report['scores'][index];weights=np.asarray([p['weight'] for p in points]);weights/=weights.sum()
    names=list(LABELS)
    forecast_values={};forecast_widths={}
    if method in ('trend','temporal'):
        cube=cube_from(data);ki=names.index(method)
        locations=np.asarray([[p['lat'],p['lon']] for p in points])
        neighbours=np.asarray([np.argsort((locations[:,0]-p['lat'])**2+((locations[:,1]-p['lon'])*np.cos(np.deg2rad(p['lat'])))**2)[:20] for p in points])
        for lead in range(1,h+1):
            ix=(lead-1)*13+month
            if method=='temporal':monthly=temporal_forecast(cube,cutoff-1981,lead)
            else:
                _,_,trend=features(cube,points,cutoff-1981,lead)
                monthly=physical(trend).reshape(len(points),12,4)
            forecast_values[ix]=period(monthly,month,cutoff+lead)
            calibration=arrays['candidate_errors'][ix,ki,cal_indices,:,:]
            forecast_widths[ix]=np.quantile(np.abs(calibration[:,neighbours,:]),.8,axis=(0,2))
        score={**score,'metrics':[{**meta,'model':method,'model_label':LABELS[method],'selection_mae':meta['candidates'][ki]['selection_mae']} for meta in score['metrics']]}
    def model(metric,point=None):
        mi=METRICS.index(metric);meta=score['metrics'][mi];selected=names.index(meta['model'])
        errors=arrays['candidate_errors'][index,:,:, :,mi]
        if point is None:
            errors=(errors*weights[None,None,:]).sum(axis=2)
            history=[{'year':r['year'],'value':r[metric]} for r in (data['monthly'] if month else data['series']) if not month or r['month']==month]
        else:
            errors=errors[:,:,point]
            history=[{'year':r['year'],'value':r[metric]} for r in (points[point]['monthly'] if month else points[point]['series']) if not month or r['month']==month]
        candidates=[]
        for ki,kind in enumerate(names):
            candidates.append({'model':kind,'label':LABELS[kind],
                'selection_mae':meta['candidates'][ki]['selection_mae'],
                'evaluation_mae':float(np.abs(errors[ki,test_indices]).mean()),'rmse':float(np.sqrt((errors[ki,test_indices]**2).mean()))})
        future=[]
        for lead in range(1,h+1):
            ix=(lead-1)*13+month
            values=(forecast_values[ix] if forecast_values else arrays['values'][ix])[:,mi]
            if point is None:
                value=float(values@weights);s=report['scores'][ix]['metrics'][mi];ki=names.index(method if forecast_values else s['model'])
                radius=float(np.quantile(np.abs(arrays['candidate_errors'][ix,ki,cal_indices,:,mi]@weights),.8))
            else:value=float(values[point]);radius=float((forecast_widths[ix] if forecast_values else arrays['widths'][ix])[point,mi])
            def limit(v):return max(0,min(100,v)) if metric=='humidity' else max(0,v) if metric in ('precipitation','wind') else v
            future.append({'year':cutoff+lead,'value':value,'low':limit(value-radius),'high':limit(value+radius)})
        reference=[r['value'] for r in history if 1981<=r['year']<=2010]
        normal=float(np.mean(reference))
        slope,intercept=np.polyfit([r['year']-1981 for r in history],[r['value'] for r in history],1)
        for row in history+future:
            row['anomaly']=row['value']-normal
            row['trend']=float(intercept+slope*(row['year']-1981))
        observed=[]
        if observations:
            container=observations if point is None else observations['points'][point]
            observed=[{'year':r['year'],'value':r[metric],'anomaly':r[metric]-normal} for r in (container['monthly'] if month else container['series']) if cutoff<r['year']<=year and (not month or r['month']==month)]
        actual=next((r['value'] for r in observed if r['year']==year),None)
        evaluation=candidates[selected]['evaluation_mae'];baseline=candidates[0]['evaluation_mae']
        return {'model':meta['model'],'model_label':meta['model_label'],'history':history,'future':future,'estimate':future[-1],
                'normal':normal,'normal_period':'1981–2010','trend_per_year':float(slope),
                'observed':observed,'actual':actual,'forecast_error':future[-1]['value']-actual if actual is not None else None,
                'last_actual':history[-1]['value'],'training_years':cutoff-1980,'horizon':h,'evaluation_count':len(test_indices),'validation_count':len(report['selection_targets'])+len(test_indices),
                'evaluation_mae':evaluation,'rmse':candidates[selected]['rmse'],'baseline_evaluation_mae':baseline,
                'skill_percent':(1-evaluation/baseline)*100 if baseline else None,
                'selection_mae':meta['selection_mae'],'mae':evaluation,'baseline_mae':baseline,'trend_mae':candidates[1]['evaluation_mae'],
                'candidates':candidates,'selection_scope':f'user_selected_{method}' if forecast_values else 'all_grid_points',
                'validation':[{'year':target,'origin':target-h,'absolute_error':abs(float(errors[selected,ti]))} for ti,target in enumerate(targets)],
                'error_band_label':f'Емпіричний діапазон за {report["calibration_targets"][0]}–{report["calibration_targets"][-1]}; для точки — 80-й процентиль помилок 20 сусідніх точок'}
    if point_id is not None:
        point=next((i for i,p in enumerate(points) if p['id']==point_id),None)
        if point is None:raise HTTPException(404,'Точку не знайдено')
        return {'id':point_id,'metrics':{m:model(m,point) for m in METRICS}}
    regional={m:model(m) for m in METRICS}
    if compact:
        # Map/table need estimates only. Fetch a selected point's history separately.
        selected=[names.index(meta['model']) for meta in score['metrics']]
        evaluation=np.column_stack([np.abs(arrays['candidate_errors'][index,selected[mi],test_indices,:,mi]).mean(axis=0) for mi in range(4)])
        result_points=[]
        for i,p in enumerate(points):
            history=[r for r in (p['monthly'] if month else p['series']) if not month or r['month']==month]
            metrics={}
            for mi,m in enumerate(METRICS):
                normal=float(np.mean([r[m] for r in history if r['year']<=2010]));value=float((forecast_values[index] if forecast_values else arrays['values'][index])[i,mi]);radius=float((forecast_widths[index] if forecast_values else arrays['widths'][index])[i,mi])
                def limit(v):return max(0,min(100,v)) if m=='humidity' else max(0,v) if m in ('precipitation','wind') else v
                metrics[m]={'normal':normal,'model_label':score['metrics'][mi]['model_label'],'evaluation_mae':float(evaluation[i,mi]),
                            'estimate':{'year':year,'value':value,'low':limit(value-radius),'high':limit(value+radius),'anomaly':value-normal}}
            result_points.append({**{k:p[k] for k in ('id','lat','lon','country','iso','kind')},'metrics':metrics})
    else:
        result_points=[{**{k:p[k] for k in ('id','lat','lon','country','iso','kind')},'metrics':{m:model(m,i) for m in METRICS}} for i,p in enumerate(points)]
    return {'year':year,'month':month,'cutoff':cutoff,'start':1981,'point_count':len(points),'country_count':data['country_count'],
            'observation_latest':{k:observations['latest'][k] for k in ('year','month')} if observations else None,
            'grid_degrees':2,'source':data['source'],'regional':regional,'points':result_points,'spatial_method':data['spatial_method'],
            'training':{k:report[k] for k in ('train_rows','boosting_rows','features','training_end','selection_targets','calibration_targets','evaluation_targets')},
            'notice':f'Навчання за даними 1981–{cutoff}. Вибір моделі: 2005–2011, спільний для всіх горизонтів; калібрування: {report["calibration_targets"][0]}–{report["calibration_targets"][-1]}; незалежна перевірка: {report["evaluation_targets"][0]}–{report["evaluation_targets"][-1]}. Спостереження 2026 року не входять у навчання або вибір моделі й показані окремо. Не оперативний прогноз погоди: місячні або річні середні не передбачають денні максимуми чи конкретну хвилю спеки. Карта — інтерполяція оцінок сітки 2°, а не додаткові вимірювання. Аномалії відносно 1981–2010.'}
