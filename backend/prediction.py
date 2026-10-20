"""Annual weather estimates using only data available through 2018.

Choose a linear trend or a historical mean using rolling-origin validation
at the requested forecast horizon. No post-2018 observations enter fitting.
"""
import json
import math
import statistics
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
METRICS = ('temperature', 'precipitation', 'humidity', 'wind')


def bounded(value, metric):
    if metric in ('precipitation', 'wind'):
        return max(0., value)
    if metric == 'humidity':
        return min(100., max(0., value))
    return value


def fit(rows, model):
    if model == 'recent_mean':
        rows = rows[-10:]
    if model == 'recent_trend':
        rows = rows[-20:]
    mx = statistics.mean(y for y, v in rows)
    mean = statistics.mean(v for y, v in rows)
    sxx = sum((y-mx)**2 for y, v in rows)
    slope = sum((y-mx)*(v-mean) for y, v in rows)/sxx if model in ('trend','recent_trend','damped_trend') and sxx else 0.
    if model == 'damped_trend':
        last = rows[-1][0]
        return lambda year: mean+slope*(last-mx)+slope*sum(.85**i for i in range(1,max(0,year-last)+1))
    return lambda year: mean+slope*(year-mx)


def quantile(values, p):
    ordered = sorted(values)
    index = (len(ordered)-1)*p
    lo = math.floor(index)
    return ordered[lo]+(ordered[math.ceil(index)]-ordered[lo])*(index-lo)


def forecast_metric(series, metric, target=2026):
    rows = sorted((r['year'], float(r[metric])) for r in series
                  if 1980 <= r['year'] <= 2018 and r.get(metric) is not None and math.isfinite(float(r[metric])))
    if len(rows) < 30 or rows[-1][0] != 2018 or len({y for y,v in rows}) != len(rows):
        raise ValueError('Потрібно щонайменше 30 повних років із завершенням у 2018 році')
    horizon = target-2018
    if not 1 <= horizon <= 12:
        raise ValueError('Оберіть рік 2019–2030')
    lookup = dict(rows)
    scores = {}
    labels = {'mean':'Історичне середнє','trend':'Лінійний тренд','recent_mean':'Середнє останніх 10 років','recent_trend':'Тренд останніх 20 років','damped_trend':'Згасаючий тренд'}
    for model in labels:
        validation = []
        for origin in range(1999, 2019-horizon):
            training = [(y,v) for y,v in rows if y <= origin]
            test_year = origin+horizon
            if len(training) < 20 or test_year not in lookup:
                continue
            value = bounded(fit(training, model)(test_year), metric)
            validation.append({'origin': origin, 'year': test_year, 'actual': lookup[test_year], 'prediction': value,
                               'absolute_error': abs(lookup[test_year]-value)})
        if len(validation) < 6:
            raise ValueError('Недостатньо історичних перевірок для цього горизонту')
        selection = validation[:-3]
        evaluation = validation[-3:]
        scores[model] = {'mae': statistics.mean(r['absolute_error'] for r in validation),
                         'selection_mae': statistics.mean(r['absolute_error'] for r in selection),
                         'evaluation_mae': statistics.mean(r['absolute_error'] for r in evaluation), 'validation': validation}
    best = min(score['selection_mae'] for score in scores.values())
    chosen = next(key for key in scores if scores[key]['selection_mae'] <= best+1e-9*max(1,abs(best)))
    predictor = fit(rows, chosen)
    # An empirical error band, NOT a calibrated probability guarantee.
    future = []
    for year in range(2019,target+1):
        lead = year-2018
        errors = []
        for origin in range(1999,2019-lead):
            training = [(y,v) for y,v in rows if y<=origin]
            if len(training)>=20 and origin+lead in lookup:
                errors.append(abs(lookup[origin+lead]-bounded(fit(training,chosen)(origin+lead),metric)))
        width = quantile(errors,.8)
        future.append({'year':year,'value':bounded(predictor(year),metric),
                       'low':bounded(predictor(year)-width,metric),'high':bounded(predictor(year)+width,metric)})
    return {'model': chosen, 'model_label': labels[chosen],
            'mae': scores[chosen]['mae'], 'baseline_mae': scores['mean']['mae'],
            'trend_mae': scores['trend']['mae'], 'validation': scores[chosen]['validation'],
            'evaluation_mae': scores[chosen]['evaluation_mae'], 'baseline_evaluation_mae': scores['mean']['evaluation_mae'],
            'selection_mae': scores[chosen]['selection_mae'], 'evaluation_count':3,
            'candidates':[{'model':key,'label':labels[key],**{k:v for k,v in score.items() if k!='validation'}} for key,score in scores.items()],
            'validation_count': len(scores[chosen]['validation']), 'horizon': horizon,
            'history': [{'year': y, 'value': v} for y,v in rows], 'future': future,
            'estimate': future[-1], 'last_actual': rows[-1][1], 'training_years': len(rows),
            'error_band_label': '±80-й процентиль абсолютних помилок історичної перевірки'}


@lru_cache(maxsize=1)
def dataset():
    if (ROOT/'samples/europe-weather-full.json.gz').exists():
        from .europe_ml import load_full
        return load_full()
    path = ROOT / 'samples/europe-weather-1981-2018.json'
    if not path.exists():
        raise HTTPException(503, 'Історичний набір Європи ще не підготовлено. Запустіть scripts/fetch_europe_forecast.py.')
    return json.loads(path.read_text(encoding='utf-8'))


class PredictionRequest(BaseModel):
    year: int = Field(default=2026, ge=2019, le=2030)
    month: int = Field(default=0, ge=0, le=12)
    cutoff: Literal[2018,2025] = 2018
    compact: bool = False
    point_id: str | None = None
    method: Literal['auto','trend','temporal'] = 'auto'


def create_prediction_router():
    router = APIRouter(prefix='/api/world')

    @router.post('/prediction')
    def prediction(config: PredictionRequest):
        if (ROOT/'samples/europe-weather-full.json.gz').exists():
            from .trained_prediction import prediction as trained
            return trained(config.year,config.month,config.cutoff,config.compact,config.point_id,config.method)
        data = dataset()
        def selected_series(container):
            return [r for r in container['monthly'] if r['month']==config.month] if config.month else container['series']
        try:
            regional = {metric: forecast_metric(selected_series(data), metric, config.year) for metric in METRICS}
            points = [{**{key: p[key] for key in ('id','lat','lon','country')},
                       'metrics': {metric: forecast_metric(selected_series(p), metric, config.year) for metric in METRICS}}
                      for p in data['points']]
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return {'year': config.year, 'month':config.month, 'cutoff': 2018, 'start': data['start'], 'point_count': len(points),
                'source': data['source'], 'regional': regional, 'points': points,
                'spatial_method': data['spatial_method'],
                'notice': 'Статистична оцінка за даними до 2018 року. Для місяця використано лише той самий календарний місяць усіх історичних років. Останні три історичні перевірки відкладені для окремої оцінки якості. Не оперативний прогноз погоди. Індекс побудовано за грубою сіткою точок суші; він не є точним середнім усієї Європи. Діапазон відображає минулі помилки та не гарантує майбутню точність.'}

    return router
