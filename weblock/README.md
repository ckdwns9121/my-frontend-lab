# Web Locks API 실험

같은 브라우저에서 여러 탭을 열고 동일한 작업을 동시에 실행할 때 `Web Locks API`가 어떻게 중복 실행을 막는지 확인하는 예제입니다.

## 실행 방법

이 저장소 루트에서 정적 서버를 실행합니다.

```bash
python3 -m http.server 5173
```

브라우저에서 아래 주소를 엽니다.

```txt
http://localhost:5173/weblock/
```

같은 주소를 탭 2개 이상으로 열고 버튼을 눌러봅니다.

## 실험 시나리오

WMS 입고 프로세스에서 같은 작업자가 여러 탭을 띄워 동일한 입고건을 처리하는 상황을 가정합니다.

- 같은 `inboundWroDtlId`를 가진 작업은 같은 lock 이름을 사용합니다.
- `락 잡고 입고 작업 시작` 버튼은 이미 다른 탭이 작업 중이면 바로 실패합니다.
- `대기열로 입고 작업 실행` 버튼은 다른 탭의 작업이 끝날 때까지 기다린 뒤 실행됩니다.
- `BroadcastChannel`을 같이 사용해 다른 탭에 작업 시작/완료 이벤트를 알려줍니다.

## 핵심 개념

```js
navigator.locks.request("wms:inbound:WRO-1001", { ifAvailable: true }, async (lock) => {
  if (!lock) {
    return "LOCKED";
  }

  await runInboundTask();
  return "DONE";
});
```

`ifAvailable: true`를 사용하면 lock을 바로 잡을 수 없을 때 기다리지 않고 `lock === null`을 받습니다. 이 방식은 사용자에게 "다른 탭에서 처리 중"이라는 메시지를 즉시 보여주기 좋습니다.

```js
navigator.locks.request("wms:inbound:WRO-1001", async () => {
  await runInboundTask();
});
```

옵션 없이 요청하면 lock이 풀릴 때까지 기다렸다가 순서대로 실행됩니다.

## WMS에서의 적용 위치

프론트엔드에서 Web Locks를 적용하기 좋은 지점은 아래처럼 중복 실행되면 안 되는 mutation 직전입니다.

- WRO 스캔 후 작업 시작: `/inbound/set-inbound-work-info`
- 입고 수량/LOT 저장: `/inbound/set-inbound`
- 임시 라벨 생성: `/inbound/set-location-partial-info`
- 적치 확정: `/inbound/set-location`
- 입고 완료: `/inbound/complete`

## 한계

Web Locks는 같은 브라우저 컨텍스트 안에서만 동작합니다.

- 같은 브라우저의 여러 탭은 제어할 수 있습니다.
- 같은 origin의 iframe, worker도 제어할 수 있습니다.
- 다른 브라우저, 다른 PC, 다른 작업자는 제어할 수 없습니다.

그래서 실제 WMS 데이터 정합성은 서버에서 보장해야 합니다.

권장 구조는 아래와 같습니다.

```txt
서버: workSessionId + version + transaction + idempotencyKey
프론트: Web Locks + BroadcastChannel + 409/423 충돌 UX
```

Web Locks는 중복 요청을 줄이는 보조 장치이고, 최종 방어선은 서버의 lock/version 검증입니다.
