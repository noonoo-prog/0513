"""Collect the public registration section of Architecture HUB; no credentials."""
import json,re,urllib.request,urllib.parse
from html.parser import HTMLParser
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
URL='https://www.hub.go.kr/portal/dpsMain.do'
OUT=Path(__file__).resolve().parents[1]/'data/competitions.json'
class Text(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.skip=0
    def handle_starttag(self,t,a):
        if t in ('script','style'):self.skip+=1
    def handle_endtag(self,t):
        if t in ('script','style'):self.skip=max(0,self.skip-1)
    def handle_data(self,d):
        if not self.skip and d.strip():self.parts.append(d.strip())
def parse(html,now):
    p=Text();p.feed(html);text=' '.join(p.parts)
    start=text.find('참가등록 중인 설계공모');end=text.find('작품접수 중인 설계공모',start)
    if start<0 or end<0:raise ValueError('Registration section changed')
    section=text[start:end];items=[]
    for m in re.finditer(r'(D\d{9}C)\s+(.+?)(?=D\d{9}C|더 많은 공모 보기|$)',section):
        ident,body=m.groups()
        # Title precedes location/agency; use original HTML text nodes to delimit it.
        pos=next((i for i,v in enumerate(p.parts) if v==ident),None)
        if pos is None or pos+1>=len(p.parts):continue
        title=p.parts[pos+1]
        deadline=re.search(r'참가마감\s*:?\s*(\d{4}-\d{2}-\d{2})',body)
        if not deadline:continue
        date=deadline[1]
        if date<now.date().isoformat():continue
        amount=re.search(r'추정가격\s*([\d,]+)\s*원',body)
        items.append({'id':'HUB-'+ident,'number':'HUB-'+ident,'title':title,'category':'설계공모',
          'agency':'건축HUB 원문 확인','url':URL,'source_name':'건축HUB · 참가등록 목록',
          'registration_deadline':date,'registration_precision':'date','submission_deadline':None,'deadline':'',
          'budget':int(amount[1].replace(',','')) if amount else 0,'budget_type':'설계비 추정가격',
          'region':'정보 미확인','eligibility_status':'자격 확인 필요','priority':'확인 필요',
          'eligibility_missing':['참가 지역·설계실적·공동참여 자격','제출물·모형·발표·현장설명 조건'],
          'competition_type':'제안공모' if '제안' in title else '간이공모' if '간이' in title else '공모 방식 원문 확인',
          'reasons':['등록 마감은 날짜만 제공됨 · 마감시각 원문 확인','홈페이지의 참가등록 목록만 수집 · 전체 공모 목록 아님']})
    if not items:raise ValueError('No active registration records parsed; preserve previous data')
    return list({x['id']:x for x in items}.values())
def main():
    now=datetime.now(ZoneInfo('Asia/Seoul'))
    try:old=json.loads(OUT.read_text())
    except (OSError,ValueError):old={'items':[]}
    try:
        req=urllib.request.Request(URL,headers={'User-Agent':'SharkRadar/1.0 (public competition listings)'})
        with urllib.request.urlopen(req,timeout=30) as r:
            if urllib.parse.urlparse(r.url).hostname!='www.hub.go.kr':raise ValueError('Unexpected host')
            html=r.read(5000000).decode('utf-8')
        items=parse(html,now)
        data={'status':'ready','updated_at':now.isoformat(),'source':URL,'items':items}
    except Exception as e:
        data={**old,'status':'error','attempted_at':now.isoformat(),'message':'외부 수집 실패 · 이전 자료 유지 ('+type(e).__name__+')'}
    OUT.parent.mkdir(exist_ok=True);OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(data['status'],len(data.get('items',[])))
if __name__=='__main__':main()
