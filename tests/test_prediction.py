import pytest

from backend.prediction import forecast_metric
from tests.test_api import client


def test_linear_forecast_selects_trend_and_never_uses_future_observations():
    series = [{'year': y, 'temperature': 10+.1*(y-1981)} for y in range(1981,2019)]
    result = forecast_metric(series, 'temperature', 2026)
    assert result['model'] == 'trend'
    assert result['estimate']['value'] == pytest.approx(14.5)
    assert result['mae'] == pytest.approx(0, abs=1e-10)
    assert result['validation_count'] == 11
    assert all(r['year']-r['origin'] == 8 for r in result['validation'])
    assert forecast_metric(series+[{'year': 2024,'temperature': 10000}], 'temperature', 2026) == result
    assert [r['year'] for r in result['future']] == list(range(2019,2027))


def test_constant_series_uses_baseline_and_physical_bounds():
    constant = [{'year': y, 'humidity': 75} for y in range(1981,2019)]
    r = forecast_metric(constant, 'humidity', 2026)
    assert r['model'] == 'mean'
    assert r['estimate']['value'] == 75
    falling = [{'year': y, 'precipitation': max(0, 400-10*(y-1981))} for y in range(1981,2019)]
    r = forecast_metric(falling, 'precipitation', 2026)
    assert 0 <= r['estimate']['low'] <= r['estimate']['value'] <= r['estimate']['high']
    with pytest.raises(ValueError):
        forecast_metric(constant[:10], 'humidity', 2026)
    with pytest.raises(ValueError):
        forecast_metric(constant, 'humidity', 2018)


def test_real_europe_prediction_has_validation_and_separate_history():
    response = client.post('/api/world/prediction',json={'year':2026})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['cutoff'] == 2018 and data['start'] == 1981
    assert data['point_count'] == len(data['points']) == 375
    assert data['country_count'] == 46 and data['grid_degrees'] == 2
    assert data['training']['train_rows'] == 297000 and data['training']['features'] == 29
    assert data['training']['selection_targets'] == list(range(2005,2012))
    assert data['training']['calibration_targets'] == [2012,2013,2014]
    assert data['training']['evaluation_targets'] == [2015,2016,2017,2018]
    assert data['source'] == 'NASA POWER / MERRA-2'
    for metric in ['temperature','precipitation','humidity','wind']:
        model = data['regional'][metric]
        assert len(model['history']) == 38
        assert model['history'][-1]['year'] == 2018
        reference=[r['value'] for r in model['history'] if r['year']<=2010]
        assert model['normal'] == pytest.approx(sum(reference)/30)
        for row in model['history']+model['future']:
            assert row['anomaly'] == pytest.approx(row['value']-model['normal'])
        trend=model['history']+model['future']
        assert all(b['trend']-a['trend'] == pytest.approx(model['trend_per_year']) for a,b in zip(trend,trend[1:]))
        assert model['estimate']['year'] == 2026
        assert model['selection_mae'] <= next(c['selection_mae'] for c in model['candidates'] if c['model']=='mean')+1e-8
        assert model['evaluation_count'] == 4
        assert all(v['year'] <= 2018 for v in model['validation'])
        assert model['estimate']['low'] <= model['estimate']['value'] <= model['estimate']['high']
    assert client.post('/api/world/prediction',json={'year':2018}).status_code == 422


def test_updated_prediction_uses_2025_snapshot_and_reserves_2026_for_comparison():
    data=client.post('/api/world/prediction',json={'year':2026,'month':7,'cutoff':2025}).json()
    assert data['cutoff']==2025 and data['training']['training_end']==2025
    assert data['observation_latest']=={'year':2026,'month':8}
    assert data['training']['calibration_targets']==[2019,2020,2021]
    assert data['training']['evaluation_targets']==[2022,2023,2024,2025]
    for m in data['regional'].values():
        assert len(m['history'])==45 and m['history'][-1]['year']==2025
        assert m['actual'] is not None
        assert m['forecast_error']==pytest.approx(m['estimate']['value']-m['actual'])
        assert m['observed'][0]['anomaly']==pytest.approx(m['actual']-m['normal'])
        assert all(r['year']<=2025 for r in m['validation'])
    annual=client.post('/api/world/prediction',json={'year':2026,'cutoff':2025}).json()
    assert annual['regional']['temperature']['actual'] is None
    assert client.post('/api/world/prediction',json={'year':2025,'cutoff':2025}).status_code==422
    assert client.post('/api/world/prediction',json={'cutoff':2026}).status_code==422


def test_forecast_model_family_does_not_jump_between_horizons():
    import json
    from backend.trained_prediction import ART
    report=json.loads((ART/'report.json').read_text(encoding='utf-8'))
    for month in range(13):
        for metric in range(4):
            assert len({report['scores'][h*13+month]['metrics'][metric]['model'] for h in range(12)})==1


def test_2026_observations_cannot_enter_updated_training_snapshot(monkeypatch):
    from backend import europe_ml
    observed=europe_ml.load_observed()
    for p in observed['points']:
        for row in p['monthly']:
            if row['year']==2026:row['temperature']=100000
    monkeypatch.setattr(europe_ml,'load_observed',lambda:observed)
    snapshot=europe_ml.load_snapshot(2025)
    assert max(r['year'] for p in snapshot['points'] for r in p['monthly'])==2025
    assert max(r['temperature'] for p in snapshot['points'] for r in p['monthly'])<100000
    assert europe_ml.cube_from(snapshot).shape==(375,45,12,4)


def test_compact_archive_prediction_and_selected_point_match_full_forecast():
    response=client.post('/api/world/prediction',json={'year':2026,'month':1,'compact':True})
    assert response.status_code==200 and len(response.content)<750000
    data=response.json()
    assert data['cutoff']==2018 and data['observation_latest'] is None
    assert all('history' not in m for p in data['points'] for m in p['metrics'].values())
    point=data['points'][0]
    details=client.post('/api/world/prediction',json={'year':2026,'month':1,'compact':True,'point_id':point['id']}).json()
    for metric in point['metrics']:
        for key,value in point['metrics'][metric]['estimate'].items():
            assert details['metrics'][metric]['estimate'][key]==pytest.approx(value)
        assert details['metrics'][metric]['evaluation_mae']==pytest.approx(point['metrics'][metric]['evaluation_mae'])
        assert len(details['metrics'][metric]['history'])==38
        assert details['metrics'][metric]['observed']==[]
    assert client.post('/api/world/prediction',json={'compact':True,'point_id':'missing'}).status_code==404


def test_explicit_trend_forecasts_and_anomalies_follow_years_not_a_constant_mean():
    data=client.post('/api/world/prediction',json={'year':2026,'month':7,'compact':True,'method':'trend'}).json()
    temperature=data['regional']['temperature']
    assert temperature['model']=='trend' and temperature['selection_scope']=='user_selected_trend'
    assert max(r['value'] for r in temperature['future'])-min(r['value'] for r in temperature['future'])>1e-4
    assert all(r['anomaly']==pytest.approx(r['value']-temperature['normal']) for r in temperature['future'])
    assert temperature['evaluation_mae']==pytest.approx(next(c['evaluation_mae'] for c in temperature['candidates'] if c['model']=='trend'))
    point=data['points'][0]
    details=client.post('/api/world/prediction',json={'year':2026,'month':7,'compact':True,'method':'trend','point_id':point['id']}).json()
    for m in point['metrics']:
        for key,value in point['metrics'][m]['estimate'].items():assert details['metrics'][m]['estimate'][key]==pytest.approx(value)
    assert client.post('/api/world/prediction',json={'method':'random'}).status_code==422


def test_temporal_model_uses_past_residuals_and_produces_audited_nonlinear_estimates():
    import numpy as np
    from backend.europe_ml import temporal_forecast
    rng=np.random.default_rng(8)
    cube=rng.normal(0,.5,size=(2,38,12,4))+np.arange(38)[None,:,None,None]*.04+10
    changed=cube.copy();changed[:,20:]=100000
    for lead in (1,4,12):
        np.testing.assert_array_equal(temporal_forecast(cube,19,lead),temporal_forecast(changed,19,lead))
        assert np.isfinite(temporal_forecast(cube,19,lead)).all()
    data=client.post('/api/world/prediction',json={'year':2026,'month':7,'compact':True,'method':'temporal'}).json()
    model=data['regional']['temperature']
    assert model['model']=='temporal' and model['selection_scope']=='user_selected_temporal'
    values=np.asarray([r['value'] for r in model['future']])
    assert np.max(np.abs(np.diff(values,n=2)))>1e-5
    assert all(r['anomaly']==pytest.approx(r['value']-model['normal']) for r in model['future'])
    assert model['evaluation_mae']==pytest.approx(next(c['evaluation_mae'] for c in model['candidates'] if c['model']=='temporal'))
    assert all(r['year']<=2018 for r in model['validation'])
    point=data['points'][0]
    detail=client.post('/api/world/prediction',json={'year':2026,'month':7,'compact':True,'method':'temporal','point_id':point['id']}).json()
    for metric in point['metrics']:
        for key,value in point['metrics'][metric]['estimate'].items():assert detail['metrics'][metric]['estimate'][key]==pytest.approx(value)


def test_europe_map_geometry_excludes_other_continents():
    import json
    from pathlib import Path
    data=json.loads((Path(__file__).resolve().parents[1]/'frontend/public/europe-countries.geojson').read_text(encoding='utf-8'))
    ids={f['properties']['id'] for f in data['features']}
    assert {'UKR','FRA','DEU','ISL','RUS'}<=ids
    assert not {'USA','CAN','CHN','MAR','DZA','KAZ','BRA'}&ids
    def coordinates(value):
        if isinstance(value[0],(float,int)):yield value
        else:
            for child in value:yield from coordinates(child)
    for f in data['features']:
        assert all(-26<=lon<=60 and 34<=lat<=81 for lon,lat in coordinates(f['geometry']['coordinates']))


def test_monthly_prediction_uses_real_seasonal_history():
    january = client.post('/api/world/prediction',json={'year':2026,'month':1}).json()
    july = client.post('/api/world/prediction',json={'year':2026,'month':7}).json()
    assert january['month'] == 1 and july['month'] == 7
    assert january['regional']['temperature']['estimate']['value'] < july['regional']['temperature']['estimate']['value']
    from backend.prediction import dataset
    saved = dataset()
    expected = next(r for r in saved['monthly'] if r['year']==2018 and r['month']==1)['precipitation']
    assert january['regional']['precipitation']['history'][-1]['value'] == expected
    annual = next(r for r in saved['series'] if r['year']==2018)['precipitation']
    assert sum(r['precipitation'] for r in saved['monthly'] if r['year']==2018) == pytest.approx(annual)
    assert client.post('/api/world/prediction',json={'month':13}).status_code == 422


def test_held_out_years_do_not_choose_the_model():
    series = [{'year':y,'temperature':10+.1*(y-1981)} for y in range(1981,2019)]
    original = forecast_metric(series,'temperature',2026)
    changed = forecast_metric([{**r,'temperature':1000 if r['year']>=2016 else r['temperature']} for r in series],'temperature',2026)
    assert original['model'] == changed['model']
    assert original['selection_mae'] == changed['selection_mae']
    assert changed['evaluation_mae'] > original['evaluation_mae']


def test_ml_features_and_training_do_not_read_future_weather():
    import numpy as np
    from backend.europe_ml import features,training_matrix
    rng=np.random.default_rng(3);cube=rng.normal(size=(3,38,12,4)).astype(np.float32)
    points=[{'lat':50+i,'lon':10+i} for i in range(3)]
    changed=cube.copy();changed[:,20:]=100000
    a=features(cube,points,19,8);b=features(changed,points,19,8)
    for left,right in zip(a,b):np.testing.assert_array_equal(left,right)
    a=training_matrix(cube,points,2000);b=training_matrix(changed,points,2000)
    for left,right in zip(a,b):np.testing.assert_array_equal(left,right)


def test_coverage_includes_islands_microstates_and_eastern_europe():
    from backend.prediction import dataset
    data=dataset();countries={p['iso'] for p in data['points']}
    assert {'ISL','MLT','CYP','UKR','RUS','AND','VAT','LIE','MCO','SMR','BEL','MNE','KOS'}<=countries
    assert max(p['lon'] for p in data['points'])>=58
    assert min(p['lon'] for p in data['points'])<=-22
    assert all(p['weight']==0 for p in data['points'] if p['kind']=='anchor')
