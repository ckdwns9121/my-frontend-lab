# Local-first WMS Lab

StorageManager, IndexedDB, Web Locks, BroadcastChannel을 함께 써서 로컬 퍼스트 흐름을 확인하는 실험입니다.

## 확인할 수 있는 것

- `navigator.storage.estimate()`로 현재 origin 저장소 사용량과 quota 확인
- `navigator.storage.persist()`로 persistent storage 요청
- 스캔 이벤트를 서버 요청보다 IndexedDB에 먼저 저장
- pending 이벤트를 나중에 동기화하는 구조
- Web Locks로 여러 탭에서 sync가 동시에 실행되지 않게 제어
- BroadcastChannel로 다른 탭의 큐 변경을 즉시 반영

## 테스트 방법

1. 정적 서버를 켭니다.

   ```bash
   python3 -m http.server 5173
   ```

2. 브라우저에서 엽니다.

   ```text
   http://localhost:5173/local-first/
   ```

3. `스캔 이벤트 저장`을 누릅니다.
   - 화면 큐에 pending 이벤트가 즉시 추가됩니다.
   - 이 시점에는 서버 동기화를 하지 않습니다.

4. 같은 URL을 다른 탭에서도 엽니다.
   - 한 탭에서 스캔 이벤트를 만들면 다른 탭도 BroadcastChannel로 갱신됩니다.

5. 두 탭에서 동시에 `pending 동기화`를 누릅니다.
   - Web Locks를 지원하는 브라우저에서는 한 탭만 sync lock을 잡습니다.
   - 다른 탭은 이미 동기화 중이라는 로그를 남깁니다.

6. 바코드에 `FAIL`을 포함해서 저장한 뒤 동기화합니다.
   - 실패 이벤트가 `failed`로 남습니다.

## 구조

```text
사용자 스캔
-> IndexedDB에 pending 이벤트 저장
-> UI 즉시 갱신
-> BroadcastChannel로 다른 탭에 큐 변경 전파
-> sync 버튼 클릭
-> Web Locks로 sync owner 선점
-> fake server send
-> synced/failed 상태 업데이트
```

## 핵심 포인트

StorageManager는 실제 데이터를 저장하지 않습니다. 저장은 IndexedDB가 하고, StorageManager는 사용량과 persistent storage 가능 여부를 확인합니다.
