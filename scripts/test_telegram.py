#!/usr/bin/env python3
"""GitHub Actions 전용: Telegram 봇 알림 연결을 검증한다."""
import json
import os
import sys
import urllib.parse
import urllib.request

token=os.getenv("TELEGRAM_BOT_TOKEN","").strip()
chat=os.getenv("TELEGRAM_CHAT_ID","").strip()
if not token or not chat:
    print("Telegram 연결 대기: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 비공개 Secrets 두 가지를 등록하세요.")
    sys.exit(1)
message=("✅ [0513] 텔레그램 알림 테스트 성공\n"
         "건축(신축·증축), 해체, 석면감리 신규 공고를 "
         "매일 한국시간 12:30 및 19:30에 확인합니다.\n"
         "새 후보는 공고명·발주기관·마감일·원문링크를 보내며, "
         "실적 0원 업체의 입찰·낙찰 가능성은 원문 확인 전까지 미확정입니다.")
payload=urllib.parse.urlencode({
    "chat_id":chat,
    "text":message,
    "disable_web_page_preview":"true",
}).encode("utf-8")
request=urllib.request.Request(
    "https://api.telegram.org/bot"+token+"/sendMessage",
    data=payload,method="POST"
)
try:
    with urllib.request.urlopen(request,timeout=25) as response:
        result=json.loads(response.read().decode("utf-8"))
    if not result.get("ok"):
        raise RuntimeError("Telegram Bot API response not ok")
    print("TEST SUCCESS: Telegram message delivered.")
except Exception as error:
    print("TEST FAILED: "+type(error).__name__+
          ". BotFather token, Chat ID, and bot /start permission must be checked.",file=sys.stderr)
    sys.exit(1)
