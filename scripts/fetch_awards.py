#!/usr/bin/env python3
"""나라장터 용역 최종낙찰 결과 자동 수집. 낙찰률은 '예정가격 대비'이다.
실제 API 승인/응답은 GitHub Actions 비공개 Secret을 등록한 후 검증한다.
"""
import json
import os
import time
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from fetch_bids import fetch_json, get, title_category

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"data"/"awards.json"
API="https://apis.data.go.kr/1230000/as/ScsbidInfoService/getScsbidListSttusServcPPSSrch"
KEY=(os.environ.get("G2B_AWARD_API_KEY") or os.environ.get("G2B_API_KEY") or "").strip()
TZ=ZoneInfo("Asia/Seoul")
KEYWORDS=("감리", "건설사업관리", "설계")
EXCLUDE=("전기감리","전기 감리","소방감리","소방 감리","정보통신감리","정보통신 감리","문화재감리","문화재 감리")
ARCH=("건축","신축","증축","개축","학교","시설","청사","체육관","리모델링","대수선","공사감리")
DEMOLITION=("해체","철거","멸실")
ASBESTOS=("석면",)

def decimal(text):
    try:
        n=float(str(text).replace(",","").replace("%","").strip())
        return n if n == n else None
    except (TypeError,ValueError):
        return None

def classify(name):
    return title_category(name)

def normalize(item):
    title=get(item,"bidNtceNm")
    category=classify(title)
    if not category:
        return None
    number=get(item,"bidNtceNo")
    if not number:
        return None
    amount=decimal(get(item,"sucsfbidAmt"))
    rate=decimal(get(item,"sucsfbidRate"))
    # 낙찰률 응답값은 예정가격 대비 백분율로 해석. 불분명한 소수는 사용하지 않음.
    if rate is not None and not (60 <= rate <= 110):
        rate=None
    if amount is None or amount <= 0:
        return None
    return {
        "id":number+"-"+(get(item,"bidNtceOrd") or "000"),
        "number":number,
        "title":title,
        "category":category,
        "agency":get(item,"dminsttNm","ntceInsttNm"),
        "award_at":get(item,"fnlSucsfDate","sucsfbidDt","opengDt"),
        "award_amount":round(amount),
        "award_rate":rate,
        "bidder_count":get(item,"prtcptCnum","prtcptCnt"),
        "winner":get(item,"fnlSucsfCorpNm","sucsfbidCorpNm"),
        "url":"https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo="+number+
              "&bidPbancOrd="+(get(item,"bidNtceOrd") or "000")
    }

def main():
    if not KEY:
        print("Award API not connected: add G2B_AWARD_API_KEY (or G2B_API_KEY) as an Actions Secret.")
        return
    old={}
    if OUTPUT.exists():
        try:
            old=json.loads(OUTPUT.read_text(encoding="utf-8"))
        except (ValueError,OSError):
            pass
    now=datetime.now(TZ)
    start=now-timedelta(days=28 if old.get("status")!="ready" else 8)
    existing={x["id"]:x for x in old.get("items",[]) if isinstance(x,dict) and x.get("id") and title_category(x.get("title",""))}
    for keyword in KEYWORDS:
        params={
            "serviceKey":KEY, "type":"json", "pageNo":"1", "numOfRows":"100",
            "inqryDiv":"1", "bidNtceNm":keyword,
            "inqryBgnDt":start.strftime("%Y%m%d%H%M"),
            "inqryEndDt":now.strftime("%Y%m%d%H%M")
        }
        max_pages=35
        for page in range(1,max_pages+1):
            params["pageNo"]=str(page)
            data=fetch_json(API,params)
            body=data.get("response",{}).get("body",{})
            total=int(body.get("totalCount") or 0)
            items=body.get("items") or []
            if isinstance(items,dict):
                items=items.get("item",[])
            if isinstance(items,dict):
                items=[items]
            for item in items:
                if isinstance(item,dict):
                    record=normalize(item)
                    if record:
                        existing[record["id"]]=record
            if not items or page*100>=total:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError("Award results exceeded the safe pagination ceiling. Old data was kept.")
    items=sorted(existing.values(),key=lambda row:(row.get("award_at",""),row["id"]),reverse=True)[:1200]
    output={
        "status":"ready", "updated_at":now.isoformat(timespec="seconds"),
        "source":"조달청 나라장터 낙찰정보서비스 - 용역",
        "query_window":start.date().isoformat()+" ~ "+now.date().isoformat(),
        "total_valid":len(items),
        "items":items,
        "message":"공식 API에서 수신된 기록만 표시. 낙찰률은 예정가격 대비 비율이며 공고별 참가 자격을 보증하지 않습니다."
    }
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Collected "+str(len(items))+" award cases (verified source response).")

if __name__=="__main__":
    main()
