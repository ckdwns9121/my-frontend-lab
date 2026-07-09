# PDA Scan Feedback Lab

PDA 스캐너가 일반 웹사이트 input에 바코드 문자열과 Enter를 넣는 상황을 가정한 실험입니다.

## 사용하는 API

- Web Audio API: 성공/실패/중복 beep 생성
- Vibration API: 모바일/PDA에서 촉각 피드백 실행
- KeyboardEvent: 스캐너가 마지막에 넣는 Enter 감지

## 테스트 방법

1. 정적 서버를 켭니다.

   ```bash
   python3 -m http.server 5173
   ```

2. 브라우저에서 엽니다.

   ```text
   http://localhost:5173/pda-scan-feedback/
   ```

3. `작업 시작`을 누릅니다.
   - 브라우저의 Web Audio 자동재생 제한을 풀기 위한 사용자 제스처입니다.

4. 바코드 입력창에서 Enter를 누릅니다.
   - `ITEM-1001`: 성공 피드백
   - `FAIL-1001`: 실패 피드백
   - `DUP-1001`: 중복 피드백

## PDA에서의 실제 흐름

```text
PDA 스캐너 버튼
-> 현재 포커스된 input에 바코드 문자열 입력
-> Enter 입력
-> 웹 JS가 keydown Enter 감지
-> 서버 검증 API 호출
-> 성공/실패/중복에 따라 beep + vibration 실행
```

## 주의사항

- Vibration API는 Android Chrome 계열에서 테스트하는 것이 좋습니다.
- iOS Safari는 Vibration API를 기대하지 않는 편이 안전합니다.
- PDA 자체 스캐너가 이미 beep를 내는 경우 웹 beep와 중복될 수 있습니다.
- 운영에서는 성공음/실패음/진동 ON/OFF 설정을 제공하는 편이 좋습니다.
