"""Human-readable city choices mapped to existing reanalysis samples."""
import math

# Rounded city centres, used only to locate the nearest available sample.
CITIES = [
    ('kyiv', 'Київ', 'UKR', 50.45, 30.52),
    ('lviv', 'Львів', 'UKR', 49.84, 24.03),
    ('odesa', 'Одеса', 'UKR', 46.48, 30.73),
    ('kharkiv', 'Харків', 'UKR', 49.99, 36.23),
    ('dnipro', 'Дніпро', 'UKR', 48.46, 35.05),
    ('london', 'Лондон', 'GBR', 51.51, -.13),
    ('paris', 'Париж', 'FRA', 48.86, 2.35),
    ('berlin', 'Берлін', 'DEU', 52.52, 13.41),
    ('warsaw', 'Варшава', 'POL', 52.23, 21.01),
    ('prague', 'Прага', 'CZE', 50.08, 14.44),
    ('rome', 'Рим', 'ITA', 41.90, 12.50),
    ('madrid', 'Мадрид', 'ESP', 40.42, -3.70),
    ('lisbon', 'Лісабон', 'PRT', 38.72, -9.14),
]


def city_samples(points):
    result={}
    for key, name, iso, lat, lon in CITIES:
        candidates=[point for point in points if point['iso']==iso]
        if not candidates:
            continue
        def distance(point):
            a=math.sin(math.radians(point['lat']-lat)/2)**2
            a+=math.cos(math.radians(lat))*math.cos(math.radians(point['lat']))*math.sin(math.radians(point['lon']-lon)/2)**2
            return 6371*2*math.asin(min(1,math.sqrt(a)))
        nearest=min(candidates,key=distance)
        km=distance(nearest)
        if km<=180:
            result['city:'+key]=dict(name=name,point=nearest,distance_km=round(km))
    return result
