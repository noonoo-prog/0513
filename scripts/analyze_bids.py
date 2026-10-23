#!/usr/bin/env python3
"""0513: 보수적인 건축감리 공고 정제·첨부 분석·가격 계산 전제 확인.

- 확인 가능한 공개 원문/데이터만 사용한다.
- 지역/면허/실적/배치 확인 전에는 '참가 가능'으로 표시하지 않는다.
- 기초금액과 배정예산, 추정가격은 서로 다른 필드로 유지한다.
- 첨부가 열리지 않으면 '분석 불가/원문 확인 필요'로 표시한다.
"""
import io
import re
import urllib.parse
import urllib.request
import zipfile
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree

AGENCY_REGION = {
    "서울특별시": "서울", "서울시": "서울", "경기도": "경기", "인천광역시": "인천",
    "부산광역시": "부산", "대구광역시": "대구", "대전광역시": "대전",
    "광주광역시": "광주", "울산광역시": "울산", "세종특별자치시": "세종",
    "강원특별자치도": "강원", "충청북도": "충북", "충청남도": "충남",
    "전북특별자치도": "전북", "전라북도": "전북", "전라남도": "전남",
    "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주",
}
OTHER_TRADES = (
    "전기공사", "전기감리", "전기 감리", "(전기)감리", "감리자(전기)",
    "감리업자(전기)", "전력시설물 감리", "태양광발전", "햇빛이음학교",
    "정보통신", "통신공사", "통신시설", "통신감리", "통신 감리",
    "소방공사", "소방감리", "소방 감리", "감리자(소방)", "기계설비공사",
    "유무선 네트워크", "교통신호기", "보행신호등", "문화재감리",
    "수배전반", "인덕션", "조성전기공사",
)
CIVIL = (
    "위임국도", "도로개설", "도로 개설", "도로 확포장", "지방도",
    "고속도로", "도시철도", "국도 ", "교량공사", "하천정비",
    "하수관", "상수관", "오수관", "배수관로", "송수관", "관로 신설",
    "관로 개선", "도로관리", "복개철거", "건설폐기물 처리",
    "옹벽 개선", "인조잔디 운동장", "부지조성공사", "환경시설",
    "공원 조성공사", "유아체험숲", "조경공사",
)
BUILDING_HINTS = (
    "건축", "건물", "건립", "신축", "증축", "개축", "대수선", "리모델링",
    "교사동", "급식실", "체육관", "청사", "도서관", "화장실",
    "학교시설", "실내", "감리자(건축)", "건설사업관리",
    "상주감리", "비상주감리", "주택건설공사", "건물해체",
    "건축물",
)
BID_TERMS = ("감리", "건설사업관리", "공사감독")
REGION_WORDS = (
    "서울특별시", "서울시", "서울", "경기도", "경기", "인천광역시",
    "인천", "부산", "대구", "대전", "광주", "울산", "세종",
    "강원", "충청북도", "충청남도", "충북", "충남",
    "전라북도", "전북", "전라남도", "전남",
    "경상북도", "경북", "경상남도", "경남", "제주",
)

def category(title):
    clean = str(title or "").replace("감리교회", "교회")
    if not any(w in clean for w in BID_TERMS): return None
    if any(w in clean for w in OTHER_TRADES): return None
    if any(w in clean for w in CIVIL): return None
    if "석면" in clean: return "석면감리"
    if "해체" in clean or "철거" in clean or "멸실" in clean: return "해체감리"
    if any(w in clean for w in BUILDING_HINTS): return "건축감리"
    return None

def money(value):
    try:
        n=int(float(str(value).strip().replace(",","")))
        return n if 0 < n < 1_000_000_000_000_000 else None
    except (ValueError,TypeError,OverflowError):
        return None

def normalize_attachment(name,url):
    url=str(url or "").strip()
    if not url.startswith("https://"):return None
    parts=urllib.parse.urlparse(url)
    # 출처 제한: 승인되지 않은 임의 사이트로 GH runner가 접근하는 것 방지
    if parts.hostname not in ("www.g2b.go.kr","g2b.go.kr","apis.data.go.kr","www.g2b.go.kr"):
        return None
    return {"name":str(name or "공고 첨부파일")[:140], "url":url}

def attachment_list(raw):
    result=[]
    for i in range(1,11):
        url=raw.get("ntceSpecDocUrl"+str(i))
        name=raw.get("ntceSpecFileNm"+str(i),"")
        att=normalize_attachment(name,url)
        if att and att["url"] not in {x["url"] for x in result}:result.append(att)
    return result

def doc_text(data,name):
    """PDF/HWPX/HWP의 '텍스트' 부분만 추출. 스캔 PDF는 분석 불가."""
    name=name.lower()
    if data.startswith(b"%PDF-") or ".pdf" in name:
        try:
            from pypdf import PdfReader
            reader=PdfReader(io.BytesIO(data),strict=False)
            return "\n".join((p.extract_text() or "") for p in reader.pages[:35])[:110000], "PDF"
        except Exception:
            return "", "PDF 추출 실패"
    if zipfile.is_zipfile(io.BytesIO(data)):
        try:
            parts=[]
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                for p in sorted(z.namelist()):
                    if p.lower().endswith(".xml") and ("contents/section" in p.lower() or "word/document.xml" in p.lower()):
                        if z.getinfo(p).file_size>12_000_000:continue
                        root=ElementTree.fromstring(z.read(p))
                        text=" ".join(x.text or "" for x in root.iter() if x.tag.rsplit("}",1)[-1] in ("t","text"))
                        if text:parts.append(text)
            return "\n".join(parts)[:110000],"HWPX/DOCX"
        except Exception:
            return "","HWPX/DOCX 추출 실패"
    if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        try:
            import olefile
            ole=olefile.OleFileIO(io.BytesIO(data))
            header=ole.openstream("FileHeader").read()
            compressed=bool(header[36] & 1)
            sections=sorted(
                (n for n in ole.listdir() if len(n)==2 and n[0]=="BodyText" and n[1].startswith("Section")),
                key=lambda n:int(n[1][7:]) if n[1][7:].isdigit() else 0
            )
            texts=[]
            for nameparts in sections[:40]:
                sec=ole.openstream(nameparts).read()
                if compressed:sec=zlib.decompress(sec,-15)
                i=0
                while i+4<=len(sec):
                    header=int.from_bytes(sec[i:i+4],"little");i+=4
                    code=header&1023;size=header>>20
                    if size==4095:
                        if i+4>len(sec):break
                        size=int.from_bytes(sec[i:i+4],"little");i+=4
                    if size>len(sec)-i:break
                    blob=sec[i:i+size];i+=size
                    if code==67:
                        text=blob.decode("utf-16le","ignore")
                        texts.append(re.sub(r"[\x00-\x08\x0b-\x1f]", " ",text))
            ole.close()
            return "\n".join(texts)[:110000],"HWP"
        except Exception:
            return "","HWP 추출 실패"
    return "","지원하지 않는 첨부 형식"

def download_doc(att, timeout=15):
    request=urllib.request.Request(att["url"],headers={"User-Agent":"Mozilla/5.0 (compatible; BidRadar/1.0)"})
    with urllib.request.urlopen(request,timeout=timeout) as response:
        if response.geturl().split("/")[2].lower() not in (
            "www.g2b.go.kr","g2b.go.kr","apis.data.go.kr"
        ):
            raise ValueError("안전하지 않은 첨부 리다이렉트")
        b=response.read(10_000_001)
        if len(b)>10_000_000:raise ValueError("첨부파일 크기 10MB 초과")
    return doc_text(b,att["name"])

def extract_clause(text,pattern,around=100,limit=350):
    match=re.search(pattern,text,re.I)
    if not match:return ""
    cut=text[max(0,match.start()-around):min(len(text),match.end()+limit)]
    return re.sub(r"\s+"," ",cut).strip()[:550]

def analyze_text(text):
    """추정이 아닌 '근거 후보'만 추출한다. 사람이 확인하기 전에는 적격 확정 불가."""
    text=re.sub(r"\s+"," ",text or "")
    if len(text)<50:
        return {"region_clause":"","license_clause":"","performance_clause":"","staffing_clause":"",
                "floor_rate":None,"floor_evidence":"","base_amount":None,"base_evidence":"",
                "score_clause":"","doc_readable":False}
    region=extract_clause(text,r"(본점\s*소재지|주된\s*영업소|지역제한|소재지를\s*둔\s*업체|입찰참가\s*지역|지역\s*업체)",100,260)
    license=extract_clause(text,r"(건축사사무소|업종코드\s*4817|해체공사감리자|석면해체.*감리인|참가\s*자격|입찰참가자격)",60,350)
    perf=extract_clause(text,r"(최근\s*\d+\s*년.{0,140}실적|실적\s*(제한|요건|평가|배점|필수)|수행\s*실적|준공\s*실적)",60,380)
    staffing=extract_clause(text,r"(특급\s*(감리원|기술인)|고급\s*(감리원|기술인)|중급\s*(감리원|기술인)|초급\s*(감리원|기술인)|배치\s*(계획|기준|기간|인원)|상주\s*감리원)",70,320)
    floor=extract_clause(text,r"(낙찰\s*하한\s*율|낙찰하한율|투찰\s*하한\s*율|투찰하한율)",70,100)
    rate=None
    if floor:
        m=re.search(r"(?:하한\s*율|하한율)[^\d%]{0,55}(\d{2}\.\d{1,4})\s*%",floor,re.I)
        if m and 80<=float(m.group(1))<=100:rate=float(m.group(1))
    base=extract_clause(text,r"(기초금액|기초\s*금액)",40,135)
    amt=None
    if base:
        m=re.search(r"(?:기초\s*금액)[^\d]{0,28}([\d,]{6,18})\s*원",base)
        if m:amt=money(m.group(1))
    score=extract_clause(text,r"(적격\s*심사|종합\s*평점|통과\s*점수|심사\s*기준)",50,190)
    return {"region_clause":region,"license_clause":license,"performance_clause":perf,
            "staffing_clause":staffing,"floor_rate":rate,"floor_evidence":floor,
            "base_amount":amt,"base_evidence":base,"score_clause":score,
            "doc_readable":True}

def region_evidence_from_api(region):
    r=str(region or "").strip()
    if not r or r in ("정보 미확인","미확인","미지정"):return "unknown","지역제한 정보가 API에 없음"
    if any(x in r for x in ("전국","지역제한없음","제한없음","전국제한없음")):
        return "open","API 참가가능지역: "+r
    if any(x in r for x in ("서울","서울특별시")):
        return "possible","API 참가가능지역: "+r+" — 다른 조건 확인 필요"
    if any(x in r for x in REGION_WORDS) and not any(x in r for x in ("서울","전국")):
        return "excluded","API 참가가능지역: "+r+" — 서울 본점 불가 가능성 높음"
    return "unknown","지역 코드 의미 확인 필요: "+r

def region_from_doc(clause):
    if not clause:return "unknown","공고문 지역 조항 확인 안 됨"
    # 지역 제한 조항이 250자 내에 한 개 이상 발견되고, 서울이 명시되지 않으면 신중하게 제외
    if re.search(r"전국\s*(대상|업체|지역|입찰)|지역\s*제한\s*(없음|하지)|전국\s*제한없음",clause):
        return "open","공고문 발췌: "+clause[:250]
    region_words=re.findall(r"서울특별시|서울시|서울|경기도|인천광역시|충청북도|충청남도|경상북도|경상남도|전라남도|전북특별자치도|강원특별자치도|부산광역시|대구광역시|대전광역시|광주광역시|울산광역시|제주특별자치도",clause)
    if "본점" not in clause and "영업소" not in clause and "지역제한" not in clause:
        return "unknown","지역조항 맥락 추가 확인 필요"
    if region_words and not any(x in region_words for x in ("서울","서울시","서울특별시")):
        if len(set(region_words))==1 and re.search(r"(본점|주된\s*영업소).{0,90}("+re.escape(region_words[0])+r")",clause):
            return "excluded","공고문 지역 제한 발췌: "+clause[:250]
    return "unknown","공고문 지역조항 해석 필요: "+clause[:250]

def analyze_notice(item, max_docs=2):
    """자동 분석은 판정 근거와 불확실성을 명시한다."""
    title=str(item.get("title",""))
    cat=category(title)
    if not cat:
        return None
    item=dict(item)
    item["category"]=cat
    item["eligibility_status"]="자격 확인 필요"
    item["eligibility_evidence"]=[]
    item["eligibility_missing"]=[]
    item["document_analysis"]={"status":"미확인","files":[],"evidence":{}}
    item["price_analysis"]={"status":"계산 불가","reason":"공고 기초금액·낙찰하한율·참가자격 확인 필요","base_amount":None,
                            "floor_rate":None,"adjustment_rate":None}
    api_region=item.get("region","정보 미확인")
    region_status,region_msg=region_evidence_from_api(api_region)
    item["eligibility_evidence"].append(region_msg)
    file_analysis=[]
    best=None
    valid_count=0
    attachments=item.get("attachments",[])
    for att in attachments[:max_docs]:
        try:
            text,file_type=download_doc(att)
            extracted=analyze_text(text)
            file_analysis.append({"name":att["name"],"format":file_type,
                                  "status":"본문 추출됨" if extracted["doc_readable"] else "본문 추출 불가"})
            if extracted["doc_readable"]:
                valid_count+=1
                if best is None:best=extracted
                else:
                    for k,v in extracted.items():
                        if k!="doc_readable" and not best.get(k) and v:best[k]=v
        except Exception as exc:
            file_analysis.append({"name":str(att.get("name","첨부"))[:120],
                                  "status":"다운로드 불가 ("+type(exc).__name__+")"})
    item["document_analysis"]["files"]=file_analysis
    if best:
        item["document_analysis"]["status"]="일부 텍스트 자동 추출"
        item["document_analysis"]["evidence"]={k:v for k,v in best.items() if k in (
            "region_clause","license_clause","performance_clause","staffing_clause",
            "floor_evidence","base_evidence","score_clause"
        ) and v}
        doc_region,why=region_from_doc(best.get("region_clause",""))
        if region_status=="unknown" and doc_region!="unknown":
            region_status=doc_region
        if best.get("region_clause"):item["eligibility_evidence"].append(why)
        if best.get("performance_clause"):
            item["eligibility_evidence"].append("실적 조항 발견 — 필수실적/배점은 수동 확인 필요")
        if best.get("staffing_clause"):
            item["eligibility_evidence"].append("감리원 배치조항 발견 — 개인경력·전담 가능 여부 확인 필요")
    elif attachments:
        item["document_analysis"]["status"]="첨부 자동 분석 실패 — 원문 직접 확인 필요"
    else:
        item["document_analysis"]["status"]="원문 첨부 URL 없음 — 직접 확인 필요"
    if region_status=="excluded":
        item["eligibility_status"]="참가 불가"
        item["eligibility_evidence"].append("서울 소재 사무소의 본점지역 요건에 불리합니다. 원문 최종 확인 필요")
    elif region_status in ("open","possible"):
        item["eligibility_evidence"].append("지역조건은 서울 소재 사무소에 유리하나 면허/실적/배치조건 확인 전")
    else:
        item["eligibility_missing"].append("서울 업체 참가 가능 지역")
    if not (best and best.get("license_clause")):
        item["eligibility_missing"].append("건축사사무소/감리자 등록 자격")
    if not (best and best.get("performance_clause")):
        item["eligibility_missing"].append("업체 실적 필수조건 및 배점")
    if not (best and best.get("staffing_clause")):
        item["eligibility_missing"].append("감리원 등급/배치기간/경력")
    if cat=="석면감리":
        item["eligibility_missing"].append("석면해체작업 감리인 지정·등록 요건")
    if cat=="해체감리":
        item["eligibility_missing"].append("해체공사감리자 지정 요건")
    # '참가 가능'이라는 확정 라벨은 자동 텍스트 추출만으로 만들지 않는다.
    # 사람이 원문·면허·실적·인력·PQ를 확인해 승인해야만 사용.
    base=money(item.get("base_amount"))
    floor=item.get("floor_rate")
    if not floor and best:floor=best.get("floor_rate")
    if not base and best:base=best.get("base_amount")
    if isinstance(floor,(str,int,float)):
        try:
            floor=float(floor)
            if not (80<=floor<=100):floor=None
        except ValueError:floor=None
    if base and floor:
        # '예정가격=기초금액' 가정값만 표기하고, 실제 추천가격으로 부르지 않는다.
        item["price_analysis"]={
            "status":"가정 계산 가능",
            "reason":"기초금액에 예정가격 사정률 100%를 가정한 하한선. 실투찰 추천가는 아님",
            "base_amount":base,"floor_rate":floor,"adjustment_rate":100,
            "reference_floor_amount":round(base*floor/100),
            "range_99_amount":round(base*0.99*floor/100),
            "range_101_amount":round(base*1.01*floor/100),
        }
    return item
