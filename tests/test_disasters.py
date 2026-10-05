import io
import openpyxl
from tests.test_api import client

def workbook_bytes():
    workbook=openpyxl.Workbook();sheet=workbook.active;sheet.title='EM-DAT Data'
    sheet.append(['DisNo.','ISO','Disaster Type','Disaster Group','Start Year','Start Month','Start Day','Location','Admin Units','Total Deaths','Total Affected',"Total Damage ('000 US$)"])
    sheet.append(['2000-0001-UKR','UKR','Flood','Natural',2000,6,1,'Lviv and Odessa','[{"adm1_code":3160},{"adm1_code":3163}]',2,100,12])
    sheet.append(['2001-0002-UKR','UKR','Storm','Natural',2001,None,None,'Unknown location','',None,None,None])
    sheet.append(['2002-0003-USA','USA','Flood','Natural',2002,1,1,'','',4,50,0])
    output=io.BytesIO();workbook.save(output);return output.getvalue()

def test_unique_events_null_impacts_money_conversion_and_map():
    content=workbook_bytes()
    r=client.post('/api/disaster-uploads',files={'file':('emdat.xlsx',content,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert r.status_code==200,r.text
    preview=r.json();assert preview['report']['count']==2
    assert preview['report']['skipped_foreign']==1
    assert preview['report']['incomplete_dates']==1
    ident=client.post('/api/disaster-uploads/'+preview['token']+'/commit',json={'name':'Test disasters'}).json()['id']
    data=client.get(f'/api/disaster-datasets/{ident}/analysis',params={'start':'2000-01-01','end':'2001-12-31'}).json()
    assert data['stats']['count']==2
    assert data['stats']['deaths']=={'value':2,'known':1,'unknown':1}
    assert data['stats']['damage']['value']==12000
    assert data['map']['UA-46']['value']==1 and data['map']['UA-51']['value']==1
    assert sum(d['value'] for d in data['map'].values())==2  # 1 multi-region event, not 2 events.
    selected=client.get(f'/api/disaster-datasets/{ident}/analysis',params={'start':'2000-01-01','end':'2001-12-31','region':'UA-46'}).json()
    assert selected['stats']['count']==1
    assert client.post('/api/disaster-uploads/'+preview['token']+'/commit',json={}).json()['id']==ident
    assert client.get(f'/api/disaster-datasets/{ident}/original').content==content

def test_uncertain_dates_and_empty_filter():
    r=client.post('/api/disaster-uploads',files={'file':('emdat.xlsx',workbook_bytes())}).json()
    ident=client.post('/api/disaster-uploads/'+r['token']+'/commit',json={}).json()['id']
    response=client.get(f'/api/disaster-datasets/{ident}/analysis',params={'start':'2001-07-01','end':'2001-07-31'}).json()
    assert response['stats']['count']==1
    assert response['events'][0]['date_precision']=='year'
    assert response['stats']['deaths']['value'] is None
    assert response['stats']['unlocated']==1
    empty=client.get(f'/api/disaster-datasets/{ident}/analysis',params={'start':'2024-01-01','end':'2024-12-31'}).json()
    assert empty['stats']['count']==0 and empty['stats']['damage']['value'] is None
