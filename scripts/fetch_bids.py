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
from analyze_bids import analyze_notice, attachment_list, category as refined_category, money, region_from_doc, base_from_clause, floor_from_clause

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "bids.json"
API = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch"
KST = ZoneInfo("Asia/Seoul")
KEY = os.getenv("G2B_API_KEY", "").strip()
BOT = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
CHAT = os.getenv("TELEGRAM_CHAT_ID", "").strip()
INCLUDE = ("감리", "건설사업관리", "공사감독")
EXCLUDE = ("전기감리", "전기 감리", "정보통신감리", "정보통신 감리", "소방감리", "소방 감리", "문화재감리", "문화재 감리")
ARCH = ("건축", "증축", "신축", "개축", "리모델링", "대수선", "시설개선", "학교", "청사", "체육관", "건립", "공사감리", "상주감리", "비상주감리", "감독권한대행")
DEMOLITION = ("해체", "철거", "멸실")
ASBESTOS = ("석면", "asbestos")
ALERT_STATE = ROOT / "data" / "alert_state.json"

# 공고명에는 발주기관명(예: 감리교회)과 타분야 공사명이 혼재한다.
# '건축/학교'라는 글자만 있다는 이유로 전기·소방·통신 감리까지 포함하지 않는다.
OTHER_TRADE = (
    "전기공사", "전기감리", "전기 감리", "(전기)감리", "감리자(전기)", "감리업자(전기)",
    "전력시설물 감리", "태양광발전", "햇빛이음학교", "조성전기공사",
    "정보통신", "통신공사", "통신시설", "통신 감리", "통신감리",
    "소방공사", "소방감리", "소방 감리", "감리자(소방)",
    "기계설비공사", "유무선 네트워크", "조리시설(인덕션)", "감리자(기계)",
    "문화재감리", "문화재 감리", "교통신호기", "보행신호등"
)
NOT_BUILDING = (
    "간선도로", "지방도", "도로 확포장", "고속도로", "도로 개설",
    "농업용수", "배수지", "정수장", "복개철거", "하수처리시설",
    "인조잔디 운동장", "옹벽 개선", "부지조성공사", "수리시설개보수",
    "네트워크 개선", "건설폐기물 처리", "안전점검 수행기관"
)
BUILDING = (
    "건축", "건물", "건립", "신축", "증축", "개축", "리모델링",
    "대수선", "교사동", "급식실", "체육관", "청사", "도서관",
    "화장실", "학교", "유치원", "시설개선", "공사감리",
    "상주감리", "비상주감리", "책임감리", "건설사업관리"
)

def title_category(title):
    """제목 기반 후보 분류. 지역/실적/면허는 이 함수만으로 판정하지 않는다."""
    return refined_category(title)

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
    category = title_category(title)
    if not category:
        return None
    kind = get(raw, "ntceKindNm")
    if "취소" in kind:
        return None
    deadline = get(raw, "bidClseDt")
    dt = parse_kst(deadline)
    if not dt or dt <= now:
        return None
    region = get(raw, "prtcptLmtRgnNm", "prtcptPsblRgnNm")
    # 제외 지역도 검토 기록에 남겨서 서울 업체 기준 참가 불가로 표시한다.
    contract = get(raw, "cntrctCnclsMthdNm")
    bidmethod = get(raw, "bidMethdNm")
    reasons = []
    if "수의" in contract or "수의" in title or "소액" in title:
        reasons.append("수의·소액계약 표기 — 실적 평가 여부 원문 확인")
    reasons.append(category + " 관련 공고명")
    if category == "석면감리":
        reasons.append("석면해체작업 감리인 지정·등록·배치 자격 원문 확인")
    if category == "해체감리":
        reasons.append("건축물 해체공사감리자 지정·자격·배치 요건 원문 확인")
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
        "category": category,
        "attachments":attachment_list(raw),
        "base_amount":money(get(raw,"bssamt","bsisAmt","basisAmt")),
        "floor_rate":None,
        "raw_qualification":{
            "industry":get(raw,"lcnsLmtNm","permsnIndstrytyList","indstrytyNm"),
            "participation_region":get(raw,"prtcptPsblRgnNm"),
            "limited_region":get(raw,"prtcptLmtRgnNm"),
            "joint_venture":get(raw,"cmmnSpldmdMethdNm"),
            "pq":get(raw,"pqApplDocRcptMthdNm","pqYn"),
        },
        "title":title,"agency":get(raw,"ntceInsttNm","dminsttNm"),
        "notice_at":get(raw,"bidNtceDt"),"deadline":deadline,
        "budget":get(raw,"asignBdgtAmt","presmptPrce"),
        "budget_type":("배정예산" if get(raw,"asignBdgtAmt") else "추정가격" if get(raw,"presmptPrce") else ""),
        "region":region or "정보 미확인", "contract":contract, "method":bidmethod,
        "priority":priority, "reasons":reasons,
        "eligibility":"원문 확인 필요", "performance":"업체 감리실적 필수·배점 여부 미확인",
        "staffing":("석면해체작업 감리인 지정·배치조건 원문 확인" if category == "석면감리" else
                    "해체공사감리자 지정·배치조건 원문 확인" if category == "해체감리" else
                    "건축사·상주감리원 자격/기간 원문 확인"),
        "url":get(raw,"bidNtceDtlUrl") or "https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo="+urllib.parse.quote(num)+"&bidPbancOrd="+urllib.parse.quote(order)
    }

def send_telegram(text):
    """전달 실패 시 예외를 발생시켜 재시도할 수 있도록 유지한다."""
    payload = urllib.parse.urlencode({
        "chat_id":CHAT, "text":text, "disable_web_page_preview":"true"
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.telegram.org/bot"+BOT+"/sendMessage",
        data=payload, method="POST"
    )
    with urllib.request.urlopen(request,timeout=25) as response:
        result=json.loads(response.read().decode("utf-8"))
    if not result.get("ok"):
        raise RuntimeError("Telegram sendMessage was rejected")

def send_alert(items):
    """한 메시지에 여러 공고 요약. 비밀 토큰은 파일 및 로그에 기록하지 않는다."""
    if not BOT or not CHAT or not items:
        return False
    for offset in range(0,len(items),6):
        group=items[offset:offset+6]
        lines=["[0513 감리 입찰 알림] 신규 검토 후보 "+str(len(group))+"건"]
        for x in group:
            lines.append(
                "• ["+x.get("category","감리")+"] "+x["title"][:65]+
                "\n발주: "+x["agency"][:30]+
                "\n마감: "+x["deadline"][:16]+
                "\n판정: "+x["priority"]+" (공고문 자격 검토 전)"+
                "\n"+x["url"]
            )
        lines.append("※ 감리 분야 1차 필터 통과 후 지역·실적·배치 등 자격 미확인 후보만 전송. 공고문을 반드시 확인")
        send_telegram("\n\n".join(lines))
    return True

def load_alert_state():
    try:
        value=json.loads(ALERT_STATE.read_text(encoding="utf-8"))
        if isinstance(value,dict):
            return value
    except (OSError, ValueError):
        pass
    return {"initialized":False,"seen":[],"updated_at":None}

def notify_new(items, now):
    """초기 연결 시 기존 공고 폭탄 방지, 이후 신규 공고는 누락 없이 추적."""
    if not BOT or not CHAT:
        print("Telegram secrets missing; alert delivery not yet enabled.")
        return
    state=load_alert_state()
    seen=set(state.get("seen",[]))
    ids={x["id"] for x in items}
    if not state.get("initialized"):
        try:
            send_telegram(
                "✅ 0513 건축감리 입찰 알림 연결 완료\n"
                "분야: 건축(신축·증축 포함), 해체, 석면 감리\n"
                "확인: 매일 12:30 / 19:30 (한국시간, 예약실행 지연 가능)\n"
                "기존 "+str(len(items))+"개 공고는 중복 알림 없이 등록했습니다. "
                "다음 수집부터 새로 발견되는 후보를 알려드립니다.\n"
                "※ 참가 및 낙찰자격 최종 판정은 공고문 확인 필요"
            )
        except Exception as exc:
            print("Telegram setup verification failed: "+type(exc).__name__, file=sys.stderr)
            return
        state={"initialized":True,"seen":sorted(ids),"updated_at":now.isoformat(timespec="seconds")}
    else:
        new=[x for x in items if x["id"] not in seen and x.get("eligibility_status")!="참가 불가"]
        if new:
            try:
                send_alert(new)
            except Exception as exc:
                print("Telegram notification failed: "+type(exc).__name__, file=sys.stderr)
                return
        state["seen"]=sorted(seen|ids)[-8000:]
        state["updated_at"]=now.isoformat(timespec="seconds")
        print("Telegram: "+str(len(new))+" new relevant notice(s).")
    ALERT_STATE.parent.mkdir(parents=True,exist_ok=True)
    ALERT_STATE.write_text(json.dumps(state,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def main():
    if not KEY:
        print("G2B_API_KEY not configured. Preserving existing feed; connect repository secret to enable collection.")
        return
    now=datetime.now(KST)
    before=now-timedelta(days=5)
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
    old_ids=set(x.get("id") for x in old.get("items",[]) if x.get("id") and title_category(x.get("title","")))
    for x in old.get("items",[]):
        d=parse_kst(x.get("deadline"))
        if x.get("id") not in found and d and d>now and title_category(x.get("title","")):
            found[x["id"]]=x
    # 원문 분석은 비용/시간 제한을 둔다. 공고명·차수가 동일하면 이전 분석을 재활용한다.
    previous={x.get("id"):x for x in old.get("items",[]) if isinstance(x,dict)}
    items=sorted(found.values(),key=lambda v:(v.get("priority")!="우선 검토",v.get("deadline",""),v.get("id","")))[:400]
    refreshed=[]
    new_doc_reads=0
    for x in items:
        prior=previous.get(x.get("id"),{})
        # API 원본에 부착 URL이 없을 경우에도 이전에 확인한 URL/자료를 사용한다.
        if not x.get("attachments") and prior.get("attachments"):
            x["attachments"]=prior["attachments"]
        if not x.get("base_amount") and prior.get("base_amount"):
            x["base_amount"]=prior["base_amount"]
        if not x.get("floor_rate") and prior.get("floor_rate"):
            x["floor_rate"]=prior["floor_rate"]
        if prior.get("document_analysis") and prior.get("title")==x["title"]:
            for name in ("document_analysis","eligibility_status","eligibility_evidence",
                         "eligibility_missing","price_analysis"):
                if name in prior:x[name]=prior[name]
            # 기존에 추출한 공개 공고문 근거를 새 판별 규칙으로 재평가한다.
            evidence=prior.get("document_analysis",{}).get("evidence",{})
            region_clause=evidence.get("region_clause","")
            if region_clause and x.get("region") in ("정보 미확인","미확인",""):
                kind,msg=region_from_doc(region_clause)
                if kind=="excluded":
                    x["eligibility_status"]="참가 불가"
                    reasons=x.setdefault("eligibility_evidence",[])
                    if msg not in reasons:reasons.append(msg)
                elif kind in ("open","possible"):
                    reasons=x.setdefault("eligibility_evidence",[])
                    if msg not in reasons:reasons.append(msg)
            if not x.get("base_amount"):
                base=base_from_clause(evidence.get("base_evidence",""))
                if base:
                    x["base_amount"]=base
                    x["base_amount_source"]="공고문 텍스트 자동 추출 · 원문 확인 필요"
            if not x.get("floor_rate"):
                floor=floor_from_clause(evidence.get("floor_evidence",""))
                if floor:x["floor_rate"]=floor
            if x.get("base_amount") and x.get("floor_rate"):
                base=x["base_amount"];floor=x["floor_rate"]
                x["price_analysis"]={
                    "status":"가정 계산 가능","base_amount":base,"floor_rate":floor,
                    "adjustment_rate":100,
                    "reference_floor_amount":round(base*floor/100),
                    "range_99_amount":round(base*0.99*floor/100),
                    "range_101_amount":round(base*1.01*floor/100),
                    "reason":"기초금액·하한율 원문 확인 필요. 사정률 100% 가정값이며 투찰추천가가 아닙니다."
                }
            # 지역 등 API 정보가 바뀐 경우에는 보수적으로 재평가
            if x.get("region")!=prior.get("region"):
                x=analyze_notice(x,max_docs=0)
        elif new_doc_reads<12 and x.get("attachments"):
            x=analyze_notice(x,max_docs=1)
            new_doc_reads+=1
        else:
            x=analyze_notice(x,max_docs=0)
        if x is not None:refreshed.append(x)
    items=refreshed
    print("Document-analysis fetch attempts this run: "+str(new_doc_reads))
    result={"updated_at":now.isoformat(timespec="seconds"),"status":"ready","source":"조달청 나라장터 입찰공고정보서비스","query_window":before.date().isoformat()+" ~ "+now.date().isoformat(),
            "total_matches":len(items),"items":items,"message":"공고명·구조화 필드·공개 첨부 원문 일부를 분석했습니다. 참가자격은 증빙 확인 전까지 미확정입니다."}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    new=[x for x in items if x["id"] not in old_ids]
    print(f"Fetched {total_count} notices, matched {len(items)}, new candidates {len(new)}")
    notify_new(items, now)

if __name__=="__main__":
    main()
