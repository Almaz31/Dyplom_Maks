import io
import json

from tests.test_api import client
from backend.world import gdis_events


def test_world_disasters_count_events_once_and_filter_country_type_year():
    all_events = gdis_events()
    expected = [e for e in all_events if e['iso'] == 'USA' and e['type'] == 'flood' and e['year'] == 2018]
    response = client.get('/api/world/disasters', params={'start': 2018, 'end': 2018, 'country': 'USA', 'event_type': 'flood'})
    assert response.status_code == 200
    result = response.json()
    assert result['count'] == len(expected) > 0
    assert result['locations'] == sum(len(e['locations']) for e in expected)
    assert result['series'] == [{'year': 2018, 'count': len(expected)}]
    assert len({e['id'] for e in result['events']}) == result['count']
    assert result['locations'] > result['count']
    assert client.get('/api/world/disasters?start=2018&end=2017').status_code == 400
    assert client.get('/api/world/disasters?start=2024').status_code == 422


def test_world_weather_all_metrics_nulls_and_cache(monkeypatch):
    calls = []
    raw = {'latitude': 1.25, 'longitude': 2.25, 'daily': {'time': ['2023-01-01', '2023-01-02'],
        'temperature_2m_mean': [10, 20], 'precipitation_sum': [0, 5],
        'relative_humidity_2m_mean': [50, None], 'wind_speed_10m_mean': [3, 4]}}
    def fetch(url, timeout):
        calls.append(url)
        return io.BytesIO(json.dumps(raw).encode())
    monkeypatch.setattr('backend.world.urllib.request.urlopen', fetch)
    params = {'latitude': 1.23, 'longitude': 2.34, 'start': '2023-01-01', 'end': '2023-01-02'}
    r = client.get('/api/world/weather', params=params)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data['series'][1] == {'date': '2023-01-02', 'temperature': 20, 'precipitation': 5, 'humidity': None, 'wind': 4}
    assert 'wind_speed_unit=ms' in calls[0] and 'models=era5' in calls[0]
    assert client.get('/api/world/weather', params=params).json() == data
    assert len(calls) == 1
    assert client.get('/api/world/weather', params={**params, 'latitude': 91}).status_code == 422
    assert client.get('/api/world/weather', params={**params, 'end': '2022-01-01'}).status_code == 400


def test_world_weather_offline_reference():
    r = client.get('/api/world/weather?latitude=35.68&longitude=139.69')
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data['series']) == 366
    assert data['series'][0]['date'] == '2024-01-01'
    assert all(key in data['series'][0] for key in ['temperature', 'precipitation', 'humidity', 'wind'])


def test_reference_globe_values_use_the_selected_period():
    data = client.get('/api/world/weather?latitude=35.68&longitude=139.69&start=2024-01-01&end=2024-12-31').json()
    reference = client.get('/api/world/weather-reference').json()
    assert len(reference['points']) == 8
    tokyo = next(p for p in reference['points'] if p['name'] == 'Токіо')
    assert tokyo['metrics']['precipitation'] == sum(r['precipitation'] for r in data['series'])
    assert tokyo['metrics']['humidity'] == sum(r['humidity'] for r in data['series'])/366
    assert client.get('/api/world/weather-reference?start=2023-01-01&end=2023-12-31').json() == {'points': []}
    single = client.get('/api/world/weather-reference?start=2024-01-01&end=2024-01-01').json()
    tokyo_single = next(p for p in single['points'] if p['name'] == 'Токіо')
    assert tokyo_single['metrics']['temperature'] == data['series'][0]['temperature']
