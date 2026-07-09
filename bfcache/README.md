# BFCache 실험

`BFCache`는 Back/Forward Cache의 줄임말입니다. 사용자가 뒤로가기/앞으로가기를 할 때 브라우저가 이전 페이지를 새로 로드하지 않고, JS heap과 DOM 상태를 보관했다가 그대로 복원할 수 있습니다.

이 예제는 페이지가 BFCache에서 복원될 때 어떤 일이 일어나는지 확인합니다.

## 실행 방법

저장소 루트에서 정적 서버를 실행합니다.

```bash
python3 -m http.server 5173
```

브라우저에서 아래 주소를 엽니다.

```txt
http://localhost:5173/bfcache/
```

## 실험 순서

1. 카운터를 몇 번 누릅니다.
2. 메모 입력칸에 아무 텍스트를 입력합니다.
3. `상세 페이지로 이동`을 누릅니다.
4. 브라우저 뒤로가기로 돌아옵니다.
5. 카운터, 입력값, 페이지 생성 ID, 이벤트 로그가 유지되는지 확인합니다.

BFCache가 적용되면 페이지가 새로 초기화되지 않고 `pageshow` 이벤트의 `event.persisted`가 `true`가 됩니다.

## 확인 포인트

- `DOMContentLoaded`: 문서가 처음 로드될 때만 실행됩니다.
- `pagehide`: 페이지를 떠날 때 실행됩니다. BFCache 후보로 들어갈 수 있습니다.
- `pageshow`: 페이지가 처음 표시되거나 BFCache에서 복원될 때 실행됩니다.
- `event.persisted`: BFCache에서 복원되면 `true`입니다.
- `performance.getEntriesByType("navigation")[0].type`: 뒤로가기/앞으로가기 복원에서는 `"back_forward"`가 될 수 있습니다.

## 실무에서 중요한 이유

WMS 같은 업무 화면에서 BFCache를 고려하지 않으면 이런 문제가 생길 수 있습니다.

- 뒤로가기로 돌아왔는데 오래된 입고 상태가 그대로 보임
- 이전에 열었던 SSE/WebSocket/polling 상태가 예상과 다르게 남아 있음
- 화면은 살아 있는데 서버 데이터는 이미 다른 탭/작업자에 의해 바뀌어 있음
- `useEffect` 마운트 로직이 다시 실행되지 않아 최신 데이터를 가져오지 못함

그래서 업무 화면에서는 `pageshow`에서 BFCache 복원을 감지하고 필요한 데이터를 다시 검증하는 패턴이 필요합니다.

```js
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    refetchCurrentWork();
  }
});
```

## 주의할 점

`beforeunload`를 무분별하게 등록하면 브라우저가 페이지를 BFCache에 넣지 못할 수 있습니다. 이 예제는 의도적으로 `beforeunload`를 사용하지 않습니다.
