"""Reproduce a real, offline analytical example via the application's own API."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient
from backend.main import app

selection = dict(source='nasa', location='country:UKR', start='2000-01', end='2025-12',
                 metric='temperature', baseline_start=1991, baseline_end=2020,
                 variables=['temperature', 'precipitation'], transform='deseasonalized')
with TestClient(app) as client:
    report = client.post('/api/analytics/report', json=selection)
    report.raise_for_status()
    report = report.json()
    prediction = client.post('/api/analytics/forecast', json={**selection, 'horizon': 12, 'test_months': 24, 'method': 'trend'})
    prediction.raise_for_status()
    prediction = prediction.json()

correlation = next(r for r in report['correlations'] if r['x'] == 'temperature' and r['y'] == 'precipitation')
summary = dict(selection=selection, metadata=report['meta'], quality=report['quality'], baseline=report['baseline'],
               descriptive=report['stats'], annual_trend=report['annual_trend'], annual_change=report['annual_change'],
               first_anomaly=report['rows'][0], correlation=correlation,
               forecast=dict(training_start=prediction['training_start'], training_end=prediction['training_end'],
                             test_start=prediction['test_start'], test_end=prediction['test_end'],
                             accuracy=prediction['accuracy'], seasonal_naive=prediction['baseline_accuracy'],
                             first_forecast=prediction['future'][0]))
(ROOT/'docs/reproducible-analysis.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
stats = report['stats']
text = f'''# Відтворюваний приклад: кліматичний індекс України

## Вхідні дані та підготовка

NASA POWER / MERRA-2, локальні фактичні місячні знімки 1981–2018 та 2019–2025/доступні місяці 2026. Обрано індекс сітки України (country:UKR), а не точне середнє адміністративного полігона. Клітинки зважуються за cos(широти); точки малих держав із нульовою площею не впливають на індекси інших країн. Джерело: https://power.larc.nasa.gov/.

Інтервал аналізу 2000-01 — 2025-12, база 1991–2020. Прогнозні ряди не додаються до історії. Пропуски не інтерполюються. Програма перевірила {report['quality']['complete']} повних місяців із {report['quality']['months']}; підтвердження повної 30-річної бази: {report['baseline']['standard_30_year']}.

## Методи та результати

- Середнє місячних температур: {stats['mean']:.6f} °C.
- Медіана: {stats['median']:.6f} °C.
- Стандартне відхилення місячних значень (дільник n): {stats['sd']:.6f} °C.
- Тренд повних річних температур: {report['annual_trend']['slope']*10:.6f} °C / десятиліття; R² = {report['annual_trend']['r2']:.6f}.
- Різниця останнього та першого повних річних середніх: {report['annual_change']:.6f} °C.
- Пірсон для температури й опадів після віднімання календарних місячних середніх у вибраному інтервалі: {correlation['pearson']:.6f}.
- Спірмен для тих самих {correlation['n']} пар: {correlation['spearman']:.6f}.

Середнє місячних температур і середнє добових температур за весь багаторічний інтервал є різними величинами через різну довжину місяців. Річні значення для тренду зважено за календарними днями.

## Перевірка прогнозу

Модель: окремий лінійний тренд кожного календарного місяця за останніми 20 доступними роками. Початок навчання {prediction['training_start']}, кінець {prediction['training_end']}. Контрольний блок {prediction['test_start']} — {prediction['test_end']}; жодне з цих спостережень не входить у побудову прогнозу контрольного блоку.

- MAE моделі: {prediction['accuracy']['mae']:.6f} °C.
- RMSE моделі: {prediction['accuracy']['rmse']:.6f} °C.
- MAE сезонного наївного методу: {prediction['baseline_accuracy']['mae']:.6f} °C.
- RMSE сезонного наївного методу: {prediction['baseline_accuracy']['rmse']:.6f} °C.
- Перевірено {prediction['accuracy']['n']} місяці.

Менша MAE на цій вибірці належить {'сезонному тренду' if prediction['accuracy']['mae'] < prediction['baseline_accuracy']['mae'] else 'сезонному наївному методу або обидва методи рівні'}. Цей висновок стосується лише зазначених даних і горизонту контрольного блоку.

## Візуалізація й інтерпретація

Відкрийте сайт із параметрами `?page=analytics&a_view=climate&a_source=nasa&a_location=country%3AUKR&a_start=2000-01&a_end=2025-12`. Кліматичний розділ показує норму, аномалії, ковзне середнє та теплову карту. Вкладка статистики показує матрицю і діаграму розсіювання; прогнозування — окремі історію, контрольний блок і майбутній ряд. Результати експортуються з метаданими.

Знак тренду описує спрямованість оціненої лінії. Кореляція характеризує статистичну залежність без доведення причинності; усунення сезонних середніх не усуває всю автокореляцію. Зміна між кінцевими роками не дорівнює нахилу регресії. Місячні середні не дозволяють визначити добові температурні рекорди.

## Відтворення

З кореня репозиторію: `.venv/Scripts/python.exe scripts/reproduce_analytics.py`. Скрипт не запитує мережу та не імпортує нові записи в БД. Машинний результат: `docs/reproducible-analysis.json`. Після заміни вихідних знімків числові результати можуть змінитися.
'''
(ROOT/'docs/reproducible-analysis.md').write_text(text, encoding='utf-8')
print('Reproducible example written to docs/reproducible-analysis.md and .json')
