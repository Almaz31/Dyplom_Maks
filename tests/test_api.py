import csv
import io
import os
import tempfile

os.environ['CLIMATE_DATA_DIR'] = tempfile.mkdtemp(prefix='obrii-test-')
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def preview(text):
    r = client.post('/api/uploads', files={'file':('test.csv',text.encode('utf-8'),'text/csv')})
    assert r.status_code == 200, r.text
    return r.json()

def test_full_import_validation_statistics_and_export():
    data = preview('date;region;temperature;precipitation;humidity;wind\n2024-01-01;Львівська;273.15;0.002;0.5;36\n2024-01-03;UA-46;283.15;0.004;;18\n2024-01-03;UA-46;283.15;0.004;;18\nbad;UA-46;0;0;0;0\n2024-01-04;Unknown;0;0;0;0\n2024-01-05;UA-46;280;0;1.5;0\n')
    config = {'name':'Перевірка','mapping':data['mapping'],'units':{'temperature':'K','precipitation':'m','humidity':'fraction','wind':'kmh'}}
    base = '/api/uploads/'+data['token']
    report = client.post(base+'/validate',json=config).json()
    assert report['valid']==2 and report['invalid']==4
    assert report['missing']['humidity']==1
    assert client.post(base+'/commit',json=config).status_code==400
    config['skip_invalid']=True
    ident = client.post(base+'/commit',json=config).json()['id']
    params={'region':'UA-46','start':'2024-01-01','end':'2024-01-03','variable':'temperature'}
    result=client.get(f'/api/datasets/{ident}/analysis',params=params).json()
    assert result['stats']['mean']==5
    assert result['stats']['coverage']==66.7
    assert result['series'][1]['value'] is None
    params['variable']='precipitation'
    result=client.get(f'/api/datasets/{ident}/analysis',params=params).json()
    assert result['stats']['sum']==6
    params['region']='UA-51'
    assert client.get(f'/api/datasets/{ident}/analysis',params=params).json()['stats']['count']==0
    params['region']='UA-46'
    exported=client.get(f'/api/datasets/{ident}/export',params=params)
    rows=list(csv.DictReader(io.StringIO(exported.content.decode('utf-8-sig'))))
    assert len(rows)==2 and rows[0]['temperature']=='0.0'
    assert client.get(f'/api/datasets/{ident}/original').status_code==200
    assert client.post(base+'/errors',json=config).status_code==200
    assert any(d['id']==ident for d in client.get('/api/datasets').json())

def test_invalid_import_and_date_range():
    assert client.post('/api/uploads',files={'file':('x.xlsx',b'a,b','text/csv')}).status_code==400
    assert client.post('/api/uploads',files={'file':('x.csv',b'date,date\n1,2','text/csv')}).status_code==400
    data=preview('date,region,temperature\n2024-02-29,UA-30,10\n')
    config={'name':'Leap','mapping':data['mapping']}
    ident=client.post('/api/uploads/'+data['token']+'/commit',json=config).json()['id']
    result=client.get(f'/api/datasets/{ident}/analysis',params={'region':'UA-30','variable':'temperature','start':'2024-02-28','end':'2024-03-01'}).json()
    assert result['stats']['expected']==3 and result['stats']['count']==1
    assert client.get(f'/api/datasets/{ident}/map',params={'variable':'temperature','start':'2025-01-01','end':'2024-01-01'}).status_code==400

def test_no_silent_nonfinite_or_duplicate_mappings():
    data=preview('date,region,temperature,humidity\n2024-01-01,UA-30,inf,50\n2024-01-02,UA-30,10,101\n')
    config={'name':'Bad','mapping':data['mapping']}
    r=client.post('/api/uploads/'+data['token']+'/validate',json=config).json()
    assert r['valid']==0 and r['invalid']==2
    config['mapping']['humidity']='temperature'
    assert client.post('/api/uploads/'+data['token']+'/validate',json=config).status_code==400
