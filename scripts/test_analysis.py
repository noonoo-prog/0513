#!/usr/bin/env python3
"""외부 API 키 없이 안전 로직을 검증하는 회귀 테스트."""
import io
import sys
import unittest
import zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from analyze_bids import (
    category, region_evidence_from_api, region_from_doc, analyze_text,
    doc_text, analyze_notice, money, base_from_clause, floor_from_clause
)
class AnalysisTests(unittest.TestCase):
    def test_categories(self):
        self.assertEqual(category("서울 초등학교 교사동 증축 건축감리용역"),"건축감리")
        self.assertEqual(category("철거공사 해체감리용역"),"해체감리")
        self.assertEqual(category("석면해체 제거 감리용역"),"석면감리")
        self.assertIsNone(category("국도 19호선 건설사업관리용역"))
        self.assertIsNone(category("중로2 도로개설공사 건설사업관리용역"))
        self.assertIsNone(category("학교 태양광발전 전기공사 감리용역"))
        self.assertIsNone(category("건축사무소 감리교회 주차장 폐기물 처리용역"))
        self.assertIsNone(category("공원 조성공사 건설사업관리용역"))
        self.assertIsNone(category("비양도 해저관로 확충사업 건설사업관리용역"))
        self.assertIsNone(category("감포항 남측호안 보강공사 건설사업관리용역"))
        self.assertIsNone(category("중로2-01-66 개설공사 건설사업관리용역"))
        self.assertIsNone(category("홍성의료원 본관 리모델링 감리용역(전기)"))
        self.assertIsNone(category("국동항 건설공사 건설사업관리용역"))
        self.assertEqual(category("서울남부보호관찰소 청사 리모델링 건설사업관리용역"),"건축감리")
    def test_region(self):
        self.assertEqual(region_evidence_from_api("서울특별시")[0],"possible")
        self.assertEqual(region_evidence_from_api("전국")[0],"open")
        self.assertEqual(region_evidence_from_api("충청북도")[0],"excluded")
        self.assertEqual(region_evidence_from_api("정보 미확인")[0],"unknown")
        self.assertEqual(region_from_doc("입찰참가자는 본점 소재지가 충청북도에 있어야 합니다.")[0],"excluded")
        self.assertEqual(region_from_doc("본점 소재지는 서울특별시 또는 경기도여야 합니다")[0],"unknown")
        self.assertEqual(region_from_doc("나. 지역제한(경상남도) 대상 용역입니다.")[0],"excluded")
        self.assertEqual(region_from_doc("지역제한(영동군), 2인 이상 견적제출")[0],"excluded")
        self.assertEqual(region_from_doc("지역제한(서울특별시) 입찰용역입니다")[0],"possible")
        self.assertEqual(region_from_doc("울산광역시 지역제한 입찰입니다")[0],"excluded")
    def test_doc_pricing(self):
        doc=("입찰 참가자격은 건축사사무소 등록자입니다. "+
             "본점 소재지는 서울특별시 내 소재한 업체여야 합니다. "+
             "최근 5년간 건축감리 용역 실적을 평가합니다. "+
             "상주감리원은 고급 기술인 이상 배치합니다. "+
             "낙찰하한율 88.745% 기초금액: 98,000,000원 ")
        found=analyze_text(doc)
        self.assertEqual(found["floor_rate"],88.745)
        self.assertEqual(found["base_amount"],98_000_000)
        self.assertEqual(base_from_clause("기초금액 금25,531,000원 추정가격 23,210,000원"),25_531_000)
        self.assertEqual(base_from_clause("기초금액 추정가격 부가가치세 6,643,000 6,039,091 603,909"),6_643_000)
        self.assertEqual(floor_from_clause("낙찰하한율 88.745%"),88.745)
        self.assertTrue(found["license_clause"])
        self.assertTrue(found["staffing_clause"])
    def test_hwpx(self):
        bio=io.BytesIO()
        with zipfile.ZipFile(bio,"w") as z:
            z.writestr("Contents/section0.xml",'<hp:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:t>건축사사무소 본점 소재지</hp:t></hp:sec>')
        out,format_=doc_text(bio.getvalue(),"notice.hwpx")
        self.assertIn("건축사사무소",out)
        self.assertEqual(format_,"HWPX/DOCX")
    def test_no_fabricated_bid(self):
        candidate={"title":"서울 초등학교 신축 건축감리용역",
                   "region":"정보 미확인","base_amount":None,"floor_rate":None,
                   "attachments":[]}
        result=analyze_notice(candidate,max_docs=0)
        self.assertEqual(result["eligibility_status"],"자격 확인 필요")
        self.assertEqual(result["price_analysis"]["status"],"계산 불가")
        self.assertIsNone(result["price_analysis"]["base_amount"])
        self.assertIsNone(money("임의"))
    def test_confirmed_region_still_not_eligibility(self):
        candidate={"title":"서울 초등학교 신축 건축감리용역",
                   "region":"서울특별시","base_amount":100_000_000,"floor_rate":88.745,
                   "attachments":[]}
        result=analyze_notice(candidate,max_docs=0)
        self.assertEqual(result["eligibility_status"],"자격 확인 필요")
        self.assertEqual(result["price_analysis"]["status"],"가정 계산 가능")
        self.assertEqual(result["price_analysis"]["reference_floor_amount"],88_745_000)
    def test_other_region_blocks(self):
        x=analyze_notice({"title":"교사동 증축 건축감리용역","region":"충청북도",
                          "attachments":[]},max_docs=0)
        self.assertEqual(x["eligibility_status"],"참가 불가")
if __name__=="__main__":
    unittest.main()
