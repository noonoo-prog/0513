import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
from analyze_bids import category, analyze_notice
from fetch_bids import classify

class ScopeTests(unittest.TestCase):
    def test_design_and_competition(self):
        for title,expected in [('학교 화장실 개선공사 설계용역','설계용역'),('청사 리모델링 건축설계 제안공모','설계공모'),('도서관 건립 간이 설계공모','설계공모'),('체육관 신축공사 건축감리용역','건축감리'),('학교 전기설계용역',None),('학교 통신공사 설계용역',None),('도로개설 실시설계용역',None),('브랜드 디자인 공모',None)]:
            with self.subTest(title=title): self.assertEqual(category(title),expected)
    def test_mixed_design_needs_collaboration(self):
        item=classify({'bidNtceNm':'학교 내진보강 구조 및 건축 설계용역','bidNtceNo':'TEST','bidClseDt':'2026-12-01 10:00'},datetime(2026,10,24,tzinfo=ZoneInfo('Asia/Seoul')))
        self.assertIn('추가 분야',item['collaboration_status'])
        self.assertIn('감리실적과 별도',item['performance'])
        checked=analyze_notice(item,max_docs=0)
        self.assertNotIn('감리원 등급/배치기간/경력',checked['eligibility_missing'])
    def test_competition_dates_are_not_bid_close(self):
        raw={'bidNtceNm':'도서관 건립 제안 설계공모','bidNtceNo':'TEST','bidClseDt':'2026-12-01 10:00'}
        now=datetime(2026,10,24,tzinfo=ZoneInfo('Asia/Seoul'))
        result=classify(raw,now)
        self.assertIsNone(result['registration_deadline'])
        self.assertIsNone(result['submission_deadline'])
        self.assertEqual(result['competition_type'],'제안공모')
        raw['bidClseDt']=''
        self.assertIsNotNone(classify(raw,now))
        raw['ntceKindNm']='취소공고'
        self.assertIsNone(classify(raw,now))

if __name__=='__main__': unittest.main()
