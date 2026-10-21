import gzip
import json
from datetime import date

from backend.world_grid import ROOT, aggregate_snapshot
from tests.test_api import client


def test_grid_aggregation_respects_days_nulls_and_precipitation_sum():
    snapshot=dict(start='2024-01-01',end='2024-01-03',latitudes=[0],longitudes=[0],step=15,
                  source='test ERA5',license='CC BY 4.0',retrieved_at='2026-10-20',
                  points=[dict(lat=0,lon=0,daily=dict(temperature_2m_mean=[10,20,30],
                      precipitation_sum=[1,2,3],relative_humidity_2m_mean=[50,None,70],
                      wind_speed_10m_mean=[2,4,6]))])
    result=aggregate_snapshot(snapshot,date(2024,1,2),date(2024,1,3))
    metrics=result['points'][0]['metrics']
    assert metrics==dict(temperature=25,precipitation=5,humidity=None,wind=5)
    assert result['points'][0]['coverage']['humidity']==.5
    assert result['start']=='2024-01-02' and result['end']=='2024-01-03'


def test_global_grid_is_real_complete_geography_and_cached_offline(monkeypatch):
    def no_network(*args,**kwargs):
        raise AssertionError('Bundled 2024 grid must work offline')
    monkeypatch.setattr('backend.world_grid.urllib.request.urlopen',no_network)
    response=client.get('/api/world/weather-grid')
    assert response.status_code==200,response.text
    result=response.json()
    assert len(result['points'])==len(result['latitudes'])*len(result['longitudes'])==288
    assert len({(p['lat'],p['lon']) for p in result['points']})==288
    assert min(p['lat'] for p in result['points'])< -80
    assert max(p['lat'] for p in result['points'])>80
    assert min(p['lon'] for p in result['points'])< -170
    assert max(p['lon'] for p in result['points'])>170
    with gzip.open(ROOT/'samples/world-weather-grid-2024.json.gz','rt',encoding='utf-8') as file:
        snapshot=json.load(file)
    assert snapshot['urls'] and snapshot['retrieved_at']
    first=snapshot['points'][0]['daily']
    assert result['points'][0]['metrics']['precipitation']==sum(first['precipitation_sum'])
    single=client.get('/api/world/weather-grid?start=2024-02-01&end=2024-02-01').json()
    assert single['points'][0]['metrics']['temperature']==first['temperature_2m_mean'][31]


def test_global_grid_rejects_invalid_or_oversized_periods_without_network():
    assert client.get('/api/world/weather-grid?start=2025-01-01&end=2024-01-01').status_code==400
    assert client.get('/api/world/weather-grid?start=2020-01-01&end=2025-01-01').status_code==400
