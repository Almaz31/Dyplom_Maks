REGIONS = {
    'UA-05': 'Вінницька', 'UA-07': 'Волинська', 'UA-09': 'Луганська',
    'UA-12': 'Дніпропетровська', 'UA-14': 'Донецька', 'UA-18': 'Житомирська',
    'UA-21': 'Закарпатська', 'UA-23': 'Запорізька', 'UA-26': 'Івано-Франківська',
    'UA-30': 'м. Київ', 'UA-32': 'Київська', 'UA-35': 'Кіровоградська',
    'UA-40': 'м. Севастополь', 'UA-43': 'АР Крим', 'UA-46': 'Львівська',
    'UA-48': 'Миколаївська', 'UA-51': 'Одеська', 'UA-53': 'Полтавська',
    'UA-56': 'Рівненська', 'UA-59': 'Сумська', 'UA-61': 'Тернопільська',
    'UA-63': 'Харківська', 'UA-65': 'Херсонська', 'UA-68': 'Хмельницька',
    'UA-71': 'Черкаська', 'UA-74': 'Чернігівська', 'UA-77': 'Чернівецька',
}
ENGLISH = ['Vinnytsia','Volyn','Luhansk','Dnipropetrovsk','Donetsk','Zhytomyr','Zakarpattia','Zaporizhia','Ivano-Frankivsk','Kyiv City','Kyiv Oblast','Kirovohrad','Sevastopol','Crimea','Lviv','Mykolaiv','Odesa','Poltava','Rivne','Sumy','Ternopil','Kharkiv','Kherson','Khmelnytskyi','Cherkasy','Chernihiv','Chernivtsi']
ALIASES = {}
for (code, name), english in zip(REGIONS.items(), ENGLISH):
    for alias in [code, name, name + ' область', english, english + ' Oblast']:
        ALIASES[alias.casefold().strip()] = code
ALIASES.update({'київ': 'UA-30', 'kyiv': 'UA-30', 'крим': 'UA-43', 'odessa': 'UA-51'})

def region_code(value):
    return ALIASES.get(value.strip().casefold())
