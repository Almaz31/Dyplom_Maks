"""Refresh training through 2025; keep 2026 entirely outside fitting/selection."""
import hashlib
import json
import sys
from pathlib import Path
import joblib
import numpy as np
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.europe_ml import load_snapshot,cube_from,training_matrix,new_model,predict,period,LABELS

ART=ROOT/'samples/europe_models';OUT=ART/'updated';OUT.mkdir(exist_ok=True)
CALIBRATION=[2019,2020,2021];EVALUATION=[2022,2023,2024,2025];TARGETS=CALIBRATION+EVALUATION

def main():
    data=load_snapshot(2025);cube=cube_from(data);points=data['points'];names=list(LABELS)
    base=json.loads((ART/'report.json').read_text(encoding='utf-8'))
    observed_hash=hashlib.sha256((ROOT/'samples/europe-weather-observed.json.gz').read_bytes()).hexdigest()
    folds={};counts={};origins=sorted({t-h for t in TARGETS for h in range(1,6)}|{2025})
    with threadpool_limits(limits=2):
        for cutoff in origins:
            path=(ART if cutoff<=2018 else OUT)/f'fold-{cutoff}.joblib';models={}
            if path.exists():
                saved=joblib.load(path)
                if saved.get('fingerprint')==base['fingerprint'] and (cutoff<=2018 or saved.get('observed_fingerprint')==observed_hash):models=saved['models'];counts[cutoff]=saved['rows']
            if not models:
                for kind in ('ridge','boosting','ridge_trend'):
                    x,y=training_matrix(cube,points,cutoff,'trend' if kind=='ridge_trend' else 'mean');counts[cutoff]=len(x)
                    indices=np.random.default_rng(42).choice(len(x),min(25000,len(x)),replace=False) if kind=='boosting' else np.arange(len(x));models[kind]=[]
                    for mi in range(4):
                        model=new_model(kind);model.fit(x[indices],y[indices,mi]);models[kind].append(model)
                joblib.dump({'fingerprint':base['fingerprint'],'observed_fingerprint':observed_hash,'models':models,'rows':counts[cutoff]},path,compress=3)
            folds[cutoff]=models;print(f'Updated cutoff {cutoff}: {counts[cutoff]:,} examples',flush=True)
        values=[];widths=[];all_errors=[];scores=[]
        locations=np.asarray([[p['lat'],p['lon']] for p in points]);neighbours=[]
        for p in points:
            d=(locations[:,0]-p['lat'])**2+((locations[:,1]-p['lon'])*np.cos(np.deg2rad(p['lat'])))**2;neighbours.append(np.argsort(d)[:20])
        for h in range(1,6):
            forecast=predict(folds[2025],cube,points,2025,h)
            tests={t:predict(folds[t-h],cube,points,t-h,h) for t in TARGETS}
            for month in range(13):
                candidate_errors=np.stack([np.stack([period(tests[t][kind],month,t)-period(cube[:,t-1981],month,t) for t in TARGETS]) for kind in names]).astype(np.float32)
                output=np.empty((len(points),4));chosen=np.empty((len(TARGETS),len(points),4));metrics=[]
                for mi in range(4):
                    # Selection unchanged from pre-2012 rolling validation. 2026 is never consulted.
                    old=base['scores'][month]['metrics'][mi];kind=old['model'];ki=names.index(kind)
                    output[:,mi]=period(forecast[kind],month,2025+h)[:,mi];chosen[:,:,mi]=candidate_errors[ki,:,:,mi]
                    candidates=[]
                    for j,name in enumerate(names):
                        e=candidate_errors[j,3:,:,mi]
                        candidates.append({'model':name,'label':LABELS[name],'selection_mae':old['candidates'][j]['selection_mae'],
                                           'evaluation_mae':float(np.abs(e).mean()),'rmse':float(np.sqrt((e**2).mean()))})
                    metrics.append({**old,'candidates':candidates,'evaluation_mae':candidates[ki]['evaluation_mae'],'rmse':candidates[ki]['rmse'],'baseline_evaluation_mae':candidates[0]['evaluation_mae']})
                radius=np.asarray([np.quantile(np.abs(chosen[:3,near,:]),.8,axis=(0,1)) for near in neighbours])
                values.append(output);widths.append(radius);all_errors.append(candidate_errors);scores.append({'horizon':h,'month':month,'metrics':metrics})
            print(f'Updated audit horizon {h}/5',flush=True)
    np.savez_compressed(OUT/'forecasts.npz',values=np.stack(values),widths=np.stack(widths),candidate_errors=np.stack(all_errors))
    joblib.dump({'models':folds[2025],'training_end':2025,'fingerprint':base['fingerprint'],'observed_fingerprint':observed_hash},OUT/'models.joblib',compress=3)
    report={**{k:v for k,v in base.items() if k!='scores'},'training_end':2025,'train_rows':counts[2025],
            'observed_fingerprint':observed_hash,'boosting_rows':25000,'calibration_targets':CALIBRATION,'evaluation_targets':EVALUATION,'validation_targets':TARGETS,'scores':scores}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('Saved 2025-trained model. 2026 observations reserved for external comparison.',flush=True)

if __name__=='__main__':main()
