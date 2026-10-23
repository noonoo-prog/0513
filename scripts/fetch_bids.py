#!/usr/bin/env python3
"""나라장터 공개 용역공고 수집. 표기된 '우선 검토'는 낙찰가능 확정이 아닙니다."""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "bids.json"
API = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch"
KST = ZoneInfo("Asia/Seoul")
KEY = os.getenv("G2B_API_KEY", "").strip()
BOT = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
CHAT = os.getenv("TELEGRAM_CHAT_ID", "").strip()
INCLUDE = ("감리", "건설사업관리", "공사감독")
EXCLUDE = ("전기감리", "전기 감리", "정보통신감리", "정보통신 감리", "소방감리", "소방 감리", "문화재감리", "문화재 감리")
ARCH = ("건축", "증축", "신축", "개축", "리모델링", "대수선", "시설개선", "학교", "청사", "체육관", "건립", "공사감리", "상주감리", "비상주감리")
OTHER_REGIONS = ("경기도", "인천광역시", "부산광역시", "대구광역시", "대전광역시", "광주광역시", "울산광역시", "세종특별", "강원특별", "충청북도", "충청남도", "전북특별", "전라북도", "전라남도", "경상북도", "경상남도", "제주특별")
GOOD_REGION = ("서울", "전국", "제한없음", "지역제한없음")

def get(d, *keys):
    for k in keys:
        v = d.get(k)
        if v is not None and str(v).strip() not in ("", "None", "null"):
            return str(v).strip()
    return ""

def fetch_json(url, params, timeout=30):
    req = urllib.request.Request(url + "?" + urllib.parse.urlencode(params), headers={"User-Agent": "ArchitectBidRadar/1.0"})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8-sig"))
            hdr = data.get("response", {}).get("header", {})
            if str(hdr.get("resultCode", "00")) not in ("00", "0"):
                raise RuntimeError("API result: " + str(hdr.get("resultCode")) + " " + str(hdr.get("resultMsg")))
            return data
        except Exception:
            if i == 2:
                raise
            time.sleep(2 ** i)

def parse_kst(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace(" ", "T").replace("Z", "+00:00")).replace(tzinfo=KST) if "+" not in value and "Z" not in value else datetime.fromisoformat(value.replace(" ", "T").replace("Z", "+00:00")).astimezone(KST)
    except ValueError:
        return None

def classify(raw, now):
    title = get(raw, "bidNtceNm")
    if not any(s in title for s in INCLUDE) or any(s in title for s in EXCLUDE):
        return None
    if not any(s in title for s in ARCH):
        return None
    kind = get(raw, "ntceKindNm")
    if "취소" in kind:
        return None
    deadline = get(raw, "bidClseDt")
    dt = parse_kst(deadline)
    if not dt or dt <= now:
        return None
    region = get(raw, "prtcptLmtRgnNm", "prtcptPsblRgnNm")
    if region and any(s in region for s in OTHER_REGIONS) and not any(s in region for s in GOOD_REGION):
        return None
    contract = get(raw, "cntrctCnclsMthdNm")
    bidmethod = get(raw, "bidMethdNm")
    reasons = []
    if "수의" in contract or "수의" in title or "소액" in title:
        reasons.append("수의·소액계약 표기 — 실적 평가 여부 원문 확인")
    if "감리" in title and ("건축" in title or "상주" in title or "비상주" in title):
        reasons.append("건축감리 관련 공고명")
    if not region:
        reasons.append("지역제한 정보 미기재 — 서울 업체 참여 가능 여부 확인")
    elif "서울" in region:
        reasons.append("서울 지역제한 포함")
    else:
        reasons.append("전국 또는 복수지역 공고 — 참가자격 확인")
    if "적격" in contract or "적격" in bidmethod:
        reasons.append("적격심사 가능성 — 업체 실적 배점 반드시 확인")
    priority = ("우선 검토" if ("수의" in contract or "소액" in title or "수의" in title) else "확인 필요")
    num, order = get(raw, "bidNtceNo"), get(raw, "bidNtceOrd") or "000"
    if not num:
        return None
    return {
        "id":num + "-" + order, "number":num, "order":order,
        "title":title,"agency":get(raw,"ntceInsttNm","dminsttNm"),
        "notice_at":get(raw,"bidNtceDt"),"deadline":deadline,
        "budget":get(raw,"asignBdgtAmt","presmptPrce"),
        "budget_type":("배정예산" if get(raw,"asignBdgtAmt") else "추정가격" if get(raw,"presmptPrce") else ""),
        "region":region or "정보 미확인", "contract":contract, "method":bidmethod,
        "priority":priority, "reasons":reasons,
        "eligibility":"원문 확인 필요", "performance":"업체 감리실적 필수·배점 여부 미확인",
        "staffing":"건축사·상주감리원 자격/기간 원문 확인",
        "url":get(raw,"bidNtceDtlUrl") or "https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo="+urllib.parse.quote(num)+"&bidPbancOrd="+urllib.parse.quote(order)
    }

def send_alert(items):
    if not BOT or not CHAT or not items:
        return
    # 검토 후보일 뿐 확정 적격업체 표시 금지
    lines = ["[건축감리 입찰 레이더] 신규 검토 후보 " + str(len(items)) + "건"]
    for x in items[:8]:
        lines.append("• " + x["title"][:65] + "\n  " + x["deadline"][:16] + " 마감 · " + x["priority"] + "\n  " + x["url"])
    if len(items) > 8:
        lines.append("외 " + str(len(items)-8) + "건")
    lines.append("※ 실적·인력·지역조건은 공고문 확인 전까지 미확정입니다.")
    payload = urllib.parse.urlencode({"chat_id":CHAT, "text":"\n\n".join(lines), "disable_web_page_preview":"true"}).encode()
    request = urllib.request.Request("https://api.telegram.org/bot"+BOT+"/sendMessage",data=payload,method="POST")
    with urllib.request.urlopen(request,timeout=20) as resp:
        obj=json.loads(resp.read())
    if not obj.get("ok"):
        raise RuntimeError("Telegram API returned not ok")

def main():
    if not KEY:
        print("G2B_API_KEY not configured. Preserving existing feed; connect repository secret to enable collection.")
        return
    now=datetime.now(KST)
    before=now-timedelta(days=3)
    params={
        "serviceKey":KEY,"type":"json","inqryDiv":"1",
        "inqryBgnDt":before.strftime("%Y%m%d%H%M"),
        "inqryEndDt":now.strftime("%Y%m%d%H%M"),
        "numOfRows":"100",
    }
    found={}
    max_pages=50
    total_count=0
    for page in range(1,max_pages+1):
        params["pageNo"]=str(page)
        d=fetch_json(API, params)
        body=d.get("response",{}).get("body",{})
        total_count=int(body.get("totalCount") or 0)
        batch=body.get("items") or []
        if isinstance(batch,dict):
            batch=batch.get("item",[])
        if isinstance(batch,dict):
            batch=[batch]
        for raw in batch:
            if not isinstance(raw,dict):
                continue
            item=classify(raw,now)
            if item:
                found[item["id"]]=item
        if page*100>=total_count or not batch:
            break
        time.sleep(0.15)
    if page*100<total_count:
        raise RuntimeError("조회 페이지 상한 초과: 누락방지를 위해 데이터를 덮어쓰지 않습니다.")

    old={}
    if OUTPUT.exists():
        try:
            old=json.loads(OUTPUT.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass
    old_ids=set(x.get("id") for x in old.get("items",[]) if x.get("id"))
    for x in old.get("items",[]):
        d=parse_kst(x.get("deadline"))
        if x.get("id") not in found and d and d>now:
            found[x["id"]]=x
    items=sorted(found.values(),key=lambda v:(v.get("priority")!="우선 검토",v.get("deadline",""),v.get("id","")))[:400]
    result={"updated_at":now.isoformat(timespec="seconds"),"status":"ready","source":"조달청 나라장터 입찰공고정보서비스","query_window":before.date().isoformat()+" ~ "+now.date().isoformat(),
            "total_matches":len(items),"items":items,"message":"자동 수집 결과입니다. 문서 기반 자격심사는 수행하지 않았습니다."}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    new=[x for x in items if x["id"] not in old_ids and x["priority"]=="우선 검토"]
    print(f"Fetched {total_count} notices, matched {len(items)}, new priority {len(new)}")
    # 처음 연결하면 과거 3일 데이터를 대량 발송하지 않음
    if old.get("status")=="ready" and new:
        try:
            send_alert(new)
        except Exception as exc:
            print("Notification failed:",type(exc).__name__,file=sys.stderr)

if __name__=="__main__":
    main()
