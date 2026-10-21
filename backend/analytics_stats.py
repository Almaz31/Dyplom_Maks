"""Deterministic monthly analytics. No network, interpolation or future leakage."""
import calendar
import math
import statistics

METRICS = ('temperature', 'precipitation', 'humidity', 'wind')
SEASONS = {12: 'Зима', 1: 'Зима', 2: 'Зима', 3: 'Весна', 4: 'Весна', 5: 'Весна',
           6: 'Літо', 7: 'Літо', 8: 'Літо', 9: 'Осінь', 10: 'Осінь', 11: 'Осінь'}


def finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def month_index(day):
    return int(day[:4]) * 12 + int(day[5:7]) - 1


def month_label(index):
    return f'{index // 12:04d}-{index % 12 + 1:02d}'


def quantile(values, p):
    values = sorted(values)
    if not values:
        return None
    i = (len(values) - 1) * p
    a, b = math.floor(i), math.ceil(i)
    return values[a] + (values[b] - values[a]) * (i - a)


def descriptive(values):
    v = [float(x) for x in values if finite(x)]
    if not v:
        return dict(count=0, mean=None, median=None, sd=None, min=None, max=None, q1=None, q3=None, outliers=0)
    q1, q3 = quantile(v, .25), quantile(v, .75)
    return dict(count=len(v), mean=statistics.mean(v), median=statistics.median(v), sd=statistics.pstdev(v),
                min=min(v), max=max(v), q1=q1, q3=q3,
                outliers=sum(x < q1 - 1.5*(q3-q1) or x > q3 + 1.5*(q3-q1) for x in v))


def regression(pairs):
    pairs = [(float(x), float(y)) for x, y in pairs if finite(x) and finite(y)]
    n = len(pairs)
    empty = dict(n=n, slope=None, intercept=None, r2=None, pearson=None)
    if n < 3:
        return empty
    mx, my = statistics.mean(x for x, y in pairs), statistics.mean(y for x, y in pairs)
    xx = sum((x-mx)**2 for x, y in pairs)
    yy = sum((y-my)**2 for x, y in pairs)
    xy = sum((x-mx)*(y-my) for x, y in pairs)
    if xx <= 1e-20:
        return empty
    slope = xy/xx
    r = max(-1., min(1., xy/math.sqrt(xx*yy))) if yy > 1e-20 else None
    return dict(n=n, slope=slope, intercept=my-slope*mx, r2=r*r if r is not None else None, pearson=r)


def ranks(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    result = [0.] * len(values)
    start = 0
    while start < len(order):
        end = start+1
        while end < len(order) and values[order[end]] == values[order[start]]:
            end += 1
        for j in range(start, end):
            result[order[j]] = (start+1+end)/2
        start = end
    return result


def relationships(rows, variables):
    matrix = []
    for a in variables:
        for b in variables:
            pairs = [(r[a], r[b]) for r in rows if finite(r.get(a)) and finite(r.get(b))]
            fit = regression(pairs)
            rank_fit = regression(list(zip(ranks([x for x, y in pairs]), ranks([y for x, y in pairs]))))
            matrix.append(dict(x=a, y=b, **fit, spearman=rank_fit['pearson']))
    return matrix


def aggregate(rows, metric, level):
    if level == 'monthly':
        return [dict(date=r['date'], key=int(r['date'][5:7]), year=int(r['date'][:4]), value=r.get(metric)) for r in rows]
    groups = {}
    for r in rows:
        y, m = int(r['date'][:4]), int(r['date'][5:7])
        if level == 'yearly':
            label, key, year = str(y), 0, y
        else:
            year = y + (m == 12)
            key = SEASONS[m]
            label = f'{year} · {key}'
        groups.setdefault((label, key, year), []).append(r)
    output = []
    for (label, key, year), members in groups.items():
        expected = 12 if level == 'yearly' else 3
        complete = len(members) == expected and all(finite(r.get(metric)) for r in members)
        value = None
        if complete:
            if metric == 'precipitation':
                value = sum(r[metric] for r in members)
            else:
                days = [calendar.monthrange(int(r['date'][:4]), int(r['date'][5:7]))[1] for r in members]
                value = sum(r[metric]*d for r, d in zip(members, days))/sum(days)
        output.append(dict(date=label, key=key, year=year, value=value))
    return output


def climate(rows, metric, start, end, baseline_start, baseline_end, level='monthly', window=12, season='all'):
    grouped = aggregate(rows, metric, level)
    reference = {}
    for r in grouped:
        if baseline_start <= r['year'] <= baseline_end and finite(r['value']):
            reference.setdefault(r['key'], []).append(r['value'])
    expected = baseline_end-baseline_start+1
    normals = {k: dict(count=len(v), mean=statistics.mean(v), sd=statistics.pstdev(v)) for k, v in reference.items()}
    by_date = {r['date']: r for r in grouped}
    monthly_lookup = {r['date']: r for r in rows}
    selected = []
    for r in grouped:
        if level == 'monthly':
            keep = start <= r['date'] <= end and (season == 'all' or SEASONS[r['key']] == season)
        else:
            # Aggregated groups must fit entirely inside selected calendar boundaries.
            y = r['year']
            bounds = (f'{y}-01', f'{y}-12') if level == 'yearly' else {
                'Зима': (f'{y-1}-12', f'{y}-02'), 'Весна': (f'{y}-03', f'{y}-05'),
                'Літо': (f'{y}-06', f'{y}-08'), 'Осінь': (f'{y}-09', f'{y}-11')}[r['key']]
            keep = bounds[0] >= start and bounds[1] <= end and (season == 'all' or r['key'] == season)
        if not keep:
            continue
        norm = normals.get(r['key'])
        # A short/missing reference is not silently presented as a complete normal.
        usable = norm is not None and norm['count'] == expected and expected >= 10
        value = r['value']
        anomaly = value-norm['mean'] if finite(value) and usable else None
        pct = 100*anomaly/norm['mean'] if anomaly is not None and norm['mean'] != 0 else None
        z = anomaly/norm['sd'] if anomaly is not None and norm['sd'] > 1e-12 else None
        if level == 'monthly':
            ix = month_index(r['date'])
            preceding = [monthly_lookup.get(month_label(i), {}).get(metric) for i in range(ix-window+1, ix+1)]
            rolling = statistics.mean(preceding) if all(finite(v) for v in preceding) else None
            previous = by_date.get(month_label(ix-12), {}).get('value')
        else:
            previous = next((v['value'] for v in grouped if v['year'] == r['year']-1 and v['key'] == r['key']), None)
            rolling = None
        selected.append({**r, 'normal': norm['mean'] if usable else None, 'baseline_count': norm['count'] if norm else 0,
                         'anomaly': anomaly, 'precipitation_pct': pct if metric == 'precipitation' else None,
                         'z': z, 'rolling': rolling,
                         'yoy': value-previous if finite(value) and finite(previous) else None})
    trend = regression([(r['year']+(r['key']-1)/12 if level == 'monthly' else r['year'], r['value']) for r in selected if level != 'seasonal' or season != 'all'])
    # For all seasons use annual points for a trend, avoiding arbitrary seasonal x ordering.
    if level == 'seasonal' and season == 'all':
        trend = regression([(r['year'], r['value']) for r in aggregate(rows, metric, 'yearly') if f"{r['year']}-01" >= start and f"{r['year']}-12" <= end])
    complete_normal = expected == 30 and baseline_start % 10 == 1 and all(v['count'] == 30 for v in normals.values()) and len(normals) == (12 if level == 'monthly' else 4 if level == 'seasonal' else 1)
    stats = descriptive([r['value'] for r in selected])
    anomalies = [r for r in selected if finite(r['anomaly'])]
    extreme = max(anomalies, key=lambda r: abs(r['anomaly'])) if anomalies else None
    return dict(rows=selected, stats=stats, trend=trend, normals=normals,
                baseline=dict(start=baseline_start, end=baseline_end, standard_30_year=complete_normal, expected=expected),
                extreme=extreme, missing=sum(r['value'] is None for r in selected))


def physical(value, metric):
    if metric == 'humidity':
        return min(100., max(0., value))
    return max(0., value) if metric in ('wind', 'precipitation') else value


def forecast_value(training, target, metric, method):
    same_month = [r for r in training if r['date'][5:] == target[5:] and finite(r.get(metric))]
    if len(same_month) < 3:
        raise ValueError('Потрібні щонайменше три повні роки для кожного місяця')
    if method == 'naive':
        return same_month[-1][metric]
    pairs = [(int(r['date'][:4]), r[metric]) for r in same_month[-20:]]
    fit = regression(pairs)
    return physical(fit['intercept'] + fit['slope']*int(target[:4]), metric)


def forecast(rows, metric, horizon=12, test_months=24, method='trend'):
    if len(rows) < test_months+36 or any(not finite(r.get(metric)) for r in rows):
        raise ValueError('Потрібен неперервний ряд повних місяців: від трьох років навчання плюс перевірочний період')
    if any(month_index(b['date'])-month_index(a['date']) != 1 for a, b in zip(rows, rows[1:])):
        raise ValueError('Для прогнозування потрібен неперервний місячний ряд')
    split = len(rows)-test_months
    training = rows[:split]
    # Fixed chronological origin: neither model sees any held-out observations.
    validation = []
    for r in rows[split:]:
        predicted = forecast_value(training, r['date'], metric, method)
        baseline = forecast_value(training, r['date'], metric, 'naive')
        validation.append(dict(date=r['date'], actual=r[metric], predicted=predicted, baseline=baseline, error=r[metric]-predicted))
    def accuracy(key):
        errors = [r['actual']-r[key] for r in validation]
        return dict(mae=statistics.mean(abs(e) for e in errors), rmse=math.sqrt(statistics.mean(e*e for e in errors)), n=len(errors))
    future = []
    # Separate in-training calibration block at the same requested horizon.
    # These errors are never selected or calibrated using the final test block.
    calibration = []
    for lead in range(1, horizon+1):
        errors = []
        first_origin = 35 + (month_index(rows[-1]['date'])-month_index(rows[35]['date'])) % 12
        for origin in range(first_origin, split-lead, 12):
            actual = rows[origin+lead]
            errors.append(actual[metric]-forecast_value(rows[:origin+1], actual['date'], metric, method))
        calibration.append(errors)
        label = month_label(month_index(rows[-1]['date'])+lead)
        value = forecast_value(rows, label, metric, method)
        low, high = (quantile(errors, .05), quantile(errors, .95)) if len(errors) >= 10 else (None, None)
        future.append(dict(date=label, predicted=value,
                           low=physical(value+min(0., low), metric) if low is not None else None,
                           high=physical(value+max(0., high), metric) if high is not None else None,
                           calibration_n=len(errors)))
    return dict(history=[dict(date=r['date'], actual=r[metric]) for r in rows], validation=validation,
                future=future, accuracy=accuracy('predicted'), baseline_accuracy=accuracy('baseline'),
                training_start=training[0]['date'], training_end=training[-1]['date'],
                test_start=rows[split]['date'], test_end=rows[-1]['date'], final_training_end=rows[-1]['date'],
                method=method, horizon=horizon,
                interval_note='Емпіричні 5–95% квантілі помилок за відповідним горизонтом із початками всередині навчальної частини; мінімум 10 помилок. Це не гарантоване покриття.')
