import unittest
from datetime import datetime
from fetch_competitions import parse
class CompetitionTests(unittest.TestCase):
 def test_registration_only_and_date_precision(self):
  html='<h2>참가등록 중인 설계공모</h2><p>D264201469C</p><h3>도서관 제안 설계공모</h3><p>서울</p><p>추정가격 100,000,000원 참가마감 : 2026-11-20</p><h2>작품접수 중인 설계공모</h2><p>D264201458C</p><h3>마감 공모</h3>'
  data=parse(html,datetime(2026,10,26));self.assertEqual(len(data),1);self.assertEqual(data[0]['title'],'도서관 제안 설계공모');self.assertIsNone(data[0]['submission_deadline']);self.assertEqual(data[0]['deadline'],'')
 def test_layout_change_fails_closed(self):
  with self.assertRaises(ValueError):parse('<html>장애 안내</html>',datetime(2026,10,26))
