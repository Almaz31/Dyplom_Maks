import math
import gzip
import json
import io
import urllib.error
from fastapi import HTTPException
import pytest

from backend.time_series import decompose, aggregate_daily, history, residual_acf
from backend.analytics_stats import month_label, month_index
from tests.test_api import client


def series(count=120, start='1960-01'):
    return [dict(date=month_label(month_index(start)+i), temperature=10+.02*i+5*math.sin(2*math.pi*i/12)) for i in range(count)]


def test_linear_trend_and_season_are_recovered_and_components_reconstruct():
    result = decompose(series(), 'temperature')
    assert result['per_decade'] == pytest.approx(2.4)
    assert sum(r['seasonal'] for r in result['rows'][:12]) == pytest.approx(0, abs=1e-12)
    for row in result['rows'][6:-6]:
        assert row['trend']+row['seasonal']+row['cycle']+row['residual'] == pytest.approx(row['value'])
        assert row['cycle'] == pytest.approx(0, abs=1e-10)
        assert row['residual'] == pytest.approx(0, abs=1e-10)
    assert all(r['cycle'] is None and r['residual'] is None for r in result['rows'][:6]+result['rows'][-6:])
    assert all(r['per_decade'] == pytest.approx(2.4) for r in result['monthly'])


def test_missing_months_are_not_filled_or_smoothed_across():
    rows = series(240)
    rows[80]['temperature'] = None
    result = decompose(rows, 'temperature')
    assert result['complete'] == 239
    assert result['rows'][80]['value'] is None
    assert all(r['residual'] is None for r in result['rows'][74:87])
    with pytest.raises(ValueError):
        decompose(series(12), 'temperature')


def test_monthly_temperature_mean_precipitation_sum_and_partial_month():
    daily = dict(time=[f'2024-02-{d:02d}' for d in range(1,30)], temperature_2m_mean=[2]*29,
                 precipitation_sum=[3]*29, relative_humidity_2m_mean=[80]*29, wind_speed_10m_mean=[4]*29)
    result = aggregate_daily(daily)[0]
    assert result['temperature'] == 2
    assert result['precipitation'] == 87
    daily['time'].pop()
    for k in list(daily)[1:]:
        daily[k].pop()
    assert aggregate_daily(daily)[0]['precipitation'] is None


def test_month_comparisons_use_disjoint_periods_and_correct_months():
    result = decompose(series(66*12), 'temperature')
    assert result['early_period'] == [1960, 1989]
    assert result['late_period'] == [1996, 2025]
    assert all(r['count'] == 66 and r['early_count'] == 30 and r['late_count'] == 30 for r in result['monthly'])
    assert result['monthly'][0]['change'] == pytest.approx(36*12*.02)


def test_api_rejects_invalid_region_dates_metric_and_short_series():
    for update in [dict(region='UA-99'), dict(metric='fake'), dict(start='1950-01'), dict(start='2025-01'), dict(end='2100-12')]:
        response = client.post('/api/time-series/report', json=update)
        assert response.status_code == 400


def test_existing_local_data_requires_no_network(monkeypatch, tmp_path):
    def fail(*args, **kwargs):
        raise AssertionError('Network should not be needed')
    monkeypatch.setattr('backend.time_series.urllib.request.urlopen', fail)
    rows, meta = history('UA-46', '2025-12', tmp_path, '2000-01')
    assert len(rows) == 26*12
    assert rows[0]['date'] == '2000-01' and rows[-1]['date'] == '2025-12'
    assert len(meta['requests']) == 3
    assert decompose(rows, 'precipitation')['complete'] == 26*12


def test_shorter_date_selection_reuses_a_full_cached_decade(monkeypatch, tmp_path):
    block = dict(rows=series(), url='cached-test-data', retrieved_at='2026-01-01')
    with gzip.open(tmp_path/'UA-46-1960-01-1969-12.json.gz', 'wt') as f:
        json.dump(block, f)
    def fail(*args, **kwargs):
        raise AssertionError('A cached decade should be reused')
    monkeypatch.setattr('backend.time_series.urllib.request.urlopen', fail)
    rows, _ = history('UA-46', '1965-12', tmp_path)
    assert len(rows) == 72
    assert rows[-1]['date'] == '1965-12'


def test_provider_hourly_quota_is_reported_without_caching_partial_results(monkeypatch, tmp_path):
    def limited(*args, **kwargs):
        raise urllib.error.HTTPError('https://example.test', 429, 'Too Many Requests', {},
                                     io.BytesIO(b'{"reason":"Hourly API request limit exceeded"}'))
    monkeypatch.setattr('backend.time_series.urllib.request.urlopen', limited)
    with pytest.raises(HTTPException) as error:
        history('UA-05', '1969-12', tmp_path)
    assert error.value.status_code == 429
    assert 'погодинний' in error.value.detail
    assert '2000–2025' in error.value.detail
    assert not list(tmp_path.iterdir())


def test_residual_acf_uses_lagged_calendar_pairs_and_fixed_denominator():
    result = residual_acf([1, 2, 3, 4], 2)
    assert result[0] == dict(lag=1, value=.25, pairs=3)
    assert result[1]['value'] == pytest.approx(-.3)
    assert result[1]['pairs'] == 2
    missing = residual_acf([1, None, 2], 2)
    assert missing[0]['value'] is None and missing[0]['pairs'] == 0
    assert missing[1]['value'] == -.5 and missing[1]['pairs'] == 1
    assert all(r['value'] is None for r in residual_acf([2]*36))
