"""Chronological training, consistent multi-horizon selection, separate calibration/test."""
import hashlib
import json
import sys
from pathlib import Path

import joblib
import numpy as np
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.europe_ml import load_full,cube_from,training_matrix,new_model,predict,period,LABELS

ART=ROOT/'samples/europe_models';ART.mkdir(exist_ok=True)
SELECTION=list(range(2005,2012))
CALIBRATION=[2012,2013,2014]
EVALUATION=[2015,2016,2017,2018]
TARGETS=SELECTION+CALIBRATION+EVALUATION

def main():
    data=load_full();cube=cube_from(data);points=data['points']
    fingerprint=hashlib.sha256((ROOT/'samples/europe-weather-full.json.gz').read_bytes()).hexdigest()
    origins=sorted({t-h for h in range(1,13) for t in TARGETS}|{2018})
    folds={};training_counts={};names=list(LABELS)
    weights=np.asarray([p['weight'] for p in points]);weights/=weights.sum()
    with threadpool_limits(limits=2):
        for cutoff in origins:
            path=ART/f'fold-{cutoff}.joblib';models={}
            if path.exists():
                saved=joblib.load(path)
                if saved.get('fingerprint')==fingerprint:models=saved['models'];training_counts[cutoff]=saved['rows']
            missing=[k for k in ('ridge','boosting','ridge_trend') if k not in models]
            for kind in missing:
                x,y=training_matrix(cube,points,cutoff,'trend' if kind=='ridge_trend' else 'mean');training_counts[cutoff]=len(x)
                indices=np.random.default_rng(42).choice(len(x),min(25000,len(x)),replace=False) if kind=='boosting' else np.arange(len(x))
                models[kind]=[]
                for mi in range(4):
                    model=new_model(kind);model.fit(x[indices],y[indices,mi]);models[kind].append(model)
            if missing:joblib.dump({'fingerprint':fingerprint,'models':models,'rows':training_counts[cutoff]},path,compress=3)
            folds[cutoff]=models
            print(f'Trained cutoff {cutoff}: {training_counts[cutoff]:,} examples',flush=True)
        # Retain every candidate's signed errors: selection and testing can be audited.
        candidates=[];final_values=[]
        for h in range(1,13):
            predicted={t:predict(folds[t-h],cube,points,t-h,h) for t in TARGETS}
            final=predict(folds[2018],cube,points,2018,h)
            for month in range(13):
                candidates.append(np.stack([np.stack([period(predicted[t][kind],month,t)-period(cube[:,t-1981],month,t) for t in TARGETS]) for kind in names]))
                final_values.append(np.stack([period(final[kind],month,2018+h) for kind in names]))
            print(f'Audited horizon {h}/12',flush=True)
        errors=np.stack(candidates).astype(np.float32);final_values=np.stack(final_values)
        # Same model family for the complete future curve of a month and metric.
        selection=np.abs(errors[:,:,:len(SELECTION)]).mean(axis=(2,3)).reshape(12,13,len(names),4).mean(axis=0)
        choices=np.argmin(selection,axis=1)
        locations=np.asarray([[p['lat'],p['lon']] for p in points]);neighbours=[]
        for p in points:
            distance=(locations[:,0]-p['lat'])**2+((locations[:,1]-p['lon'])*np.cos(np.deg2rad(p['lat'])))**2
            neighbours.append(np.argsort(distance)[:20])
        values=[];widths=[];chosen_errors=[];scores=[]
        cal=slice(len(SELECTION),len(SELECTION)+len(CALIBRATION));test=slice(cal.stop,None)
        for ix in range(156):
            month=ix%13;output=np.empty((len(points),4));error=np.empty((len(TARGETS),len(points),4));report=[]
            for mi in range(4):
                ki=choices[month,mi];kind=names[ki];output[:,mi]=final_values[ix,ki,:,mi];error[:,:,mi]=errors[ix,ki,:,:,mi]
                reports=[]
                for j,name in enumerate(names):
                    e=errors[ix,j,:,:,mi];regional=e@weights
                    reports.append({'model':name,'label':LABELS[name],'selection_mae':float(selection[month,j,mi]),
                                    'evaluation_mae':float(np.abs(e[test]).mean()),'rmse':float(np.sqrt((e[test]**2).mean())),
                                    'regional_evaluation_mae':float(np.abs(regional[test]).mean())})
                report.append({'model':kind,'model_label':LABELS[kind],'candidates':reports,'selection_mae':float(selection[month,ki,mi]),
                               'evaluation_mae':reports[ki]['evaluation_mae'],'baseline_evaluation_mae':reports[0]['evaluation_mae'],'rmse':reports[ki]['rmse']})
            radius=np.asarray([np.quantile(np.abs(error[cal][:,near,:]),.8,axis=(0,1)) for near in neighbours])
            values.append(output);widths.append(radius);chosen_errors.append(error);scores.append({'horizon':ix//13+1,'month':month,'metrics':report})
    np.savez_compressed(ART/'forecasts.npz',values=np.stack(values),widths=np.stack(widths),errors=np.stack(chosen_errors),candidate_errors=errors)
    joblib.dump({'fingerprint':fingerprint,'models':folds[2018],'features':29,'training_end':2018},ART/'models.joblib',compress=3)
    report={'version':2,'fingerprint':fingerprint,'point_count':len(points),'country_count':data['country_count'],'train_rows':training_counts[2018],
            'boosting_rows':min(25000,training_counts[2018]),'features':29,'training_end':2018,'selection_targets':SELECTION,
            'calibration_targets':CALIBRATION,'evaluation_targets':EVALUATION,'validation_targets':TARGETS,
            'selection_method':'mean MAE across 12 horizons and all points, one model family per month/metric','random_seed':42,'scores':scores}
    (ART/'report.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('Saved independently validated, consistent forecast curves',flush=True)

if __name__=='__main__':main()
