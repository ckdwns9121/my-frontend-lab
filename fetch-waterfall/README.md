# 컴포넌트 구조와 요청 워터폴

"형제 컴포넌트가 각자 `useQuery`(또는 `useEffect` + `fetch`)를 쓰면 요청이 차례로 나가는 워터폴이 생기지 않을까?"를 직접 확인하는 실험입니다.

같은 API 세 개(사용자·책·댓글)를 **컴포넌트 배치만 바꿔** 요청하고, 각 요청의 시작·끝 시점을 화면에 막대로 그립니다.

## 실행 방법

저장소 루트에서 정적 서버를 실행합니다.

```sh
python3 -m http.server 5173 --bind 127.0.0.1
```

접속 주소: http://localhost:5173/fetch-waterfall/

시나리오를 누르면 주소가 `?run=<시나리오>&delay=<ms>`로 바뀝니다. 이 주소로 새로고침하면 같은 시나리오가 바로 실행됩니다.

## 실험 조건

- API: `./api/user`, `./api/book`, `./api/comment`. `sw.js`(Service Worker)가 가로채 지정한 시간만큼 기다린 뒤 가짜 데이터를 돌려줍니다. 정적 서버만으로도 Network 탭에 실제 요청 막대가 보이게 하려는 장치입니다.
- 지연: API 하나당 300·600·1,000ms 중 선택(기본 600ms)
- 매 실행마다 새 `QueryClient`를 만들어 캐시 없이 시작합니다.
- React 19와 TanStack Query 5를 [esm.sh](https://esm.sh)에서 불러오고, JSX 대신 [htm](https://github.com/developit/htm)을 씁니다. 빌드 도구는 없습니다.
- `StrictMode`는 쓰지 않습니다. 개발 모드에서 effect가 두 번 실행돼 요청이 두 번 보이기 때문입니다.

## 시나리오와 측정 결과

API 하나당 600ms, headless Chrome에서 잰 값입니다. "모두 반영"은 세 영역이 데이터로 다시 그려진 시점입니다.

| 시나리오 | 사용자 | 책 | 댓글 | 모두 반영 | 결과 |
| --- | --- | --- | --- | ---: | --- |
| `useEffect`: 형제 컴포넌트가 각자 요청 | 9→620 | 10→621 | 10→621 | 622ms | 병렬 |
| `useEffect`: 한 effect 안에서 `await` 세 번 | 1→607 | 608→1,213 | 1,214→1,819 | 1,822ms | 워터폴 |
| `useEffect`: 한 effect 안에서 `Promise.all` | 6→613 | 7→613 | 7→614 | 614ms | 병렬 |
| `useEffect`: 부모가 user를 받은 뒤 자식 마운트 | 1→607 | 608→1,211 | 608→1,212 | 1,213ms | 워터폴 |
| `useEffect`: 같은 화면, 요청은 부모에서 먼저 시작 | 1→607 | 1→609 | 1→609 | 609ms | 병렬 |
| TanStack: 형제 컴포넌트가 각자 `useQuery` | 2→607 | 3→608 | 3→608 | 609ms | 병렬 |
| TanStack: `isLoading` 분기 아래 자식 `useQuery` | 10→617 | 618→1,224 | 618→1,225 | 1,226ms | 워터폴 |
| TanStack: 같은 구조 + 진입 전에 `prefetchQuery` | 0→606 | 1→609 | 1→609 | 609ms | 병렬 |

## 왜 형제 컴포넌트는 병렬인가

`useQuery`와 `useEffect` 안의 `fetch`는 응답을 **기다리지 않습니다.** 요청을 걸어 두고 바로 "아직 로딩 중"을 돌려주거나 effect를 끝냅니다.

1. React가 세 형제 컴포넌트를 한 번의 렌더에서 모두 그립니다. 셋 다 로딩 상태입니다.
2. 커밋 직후 세 요청이 연달아 출발합니다.
3. 응답이 오는 대로 해당 컴포넌트만 다시 그립니다.

그래서 아래 코드는 워터폴이 아닙니다.

```jsx
<UserList />    // 각자 useQuery
<BookList />
<CommentList />
```

## 워터폴이 생기는 두 가지 경우

**1. 한 함수 안에서 `await`를 줄줄이 쓸 때**

```js
const user = await api('user');
const book = await api('book');       // user가 끝나야 출발
const comment = await api('comment'); // book이 끝나야 출발
```

`book`과 `comment`가 `user` 결과를 쓰지 않는다면 `Promise.all`로 동시에 보냅니다.

**2. 부모가 데이터를 받은 뒤에야 자식을 마운트할 때**

```jsx
const { data: user } = useQuery({ queryKey: ['user'], queryFn: getUser });
if (!user) return <Spinner />;           // ← 이 return이 사실상 await
return <><BookList /><CommentList /></>; // 마운트돼야 요청 출발
```

`BookList`의 요청이 `user`와 무관해도, 컴포넌트가 아직 없어서 요청을 보낼 기회가 없습니다. 실험 결과에서 책·댓글이 사용자 요청이 끝난 608ms 근처에 출발하는 이유입니다. 책·댓글끼리는 형제라서 서로 동시에 출발합니다.

## 고치는 방법

화면 구조(사용자 먼저 보여주기)는 그대로 두고, **요청만 일찍 시작**하면 됩니다.

- **부모에서 한 번에 시작하고 자식은 읽기만:** 부모가 세 요청의 Promise를 만들고, 자식은 React 19 `use(promise)`로 읽습니다. 자식이 늦게 마운트돼도 요청은 이미 출발한 상태입니다.
- **진입 전에 `prefetchQuery`:** 클릭 핸들러나 라우트 loader에서 `queryClient.prefetchQuery`로 미리 요청합니다. 나중에 마운트된 `useQuery`는 진행 중인 요청을 그대로 이어받습니다.
- **로딩 분기를 자식 안으로:** 부모가 `if (isLoading) return`으로 자식을 막지 말고, 각 영역이 자기 로딩을 표시하게 합니다.

`book`이 정말 `user` 결과를 써야 하는 의존 요청이라면 계단은 피할 수 없습니다. 이때는 서버에서 한 번에 내려주도록 API를 합치거나(BFF), 서버에서 처리해 왕복 횟수를 줄입니다.

## DevTools로 확인하기

1. Network 탭에서 `Fetch/XHR` 필터를 켭니다. 병렬이면 막대가 **세로로 겹치고**, 워터폴이면 **옆으로 이어집니다.** Size 열에는 `(ServiceWorker)`로 표시됩니다.
2. Performance 탭으로 녹화하면 Timings 트랙에 `api user`, `api book`, `api comment` 막대가 보입니다(`performance.measure`).
3. Application 탭 → Service workers에서 "Bypass for network"가 켜져 있으면 가짜 API가 동작하지 않습니다.

## 더 해볼 것

- 한 컴포넌트 안에 `useSuspenseQuery`를 두 번 쓰면 어떻게 될까요? 첫 번째가 suspend하면 두 번째 줄까지 실행되지 않습니다. TanStack 문서가 이 경우 `useSuspenseQueries`를 권하는 이유를 확인해보세요.
- `React.lazy`로 나눈 컴포넌트 안에서 요청하면, 코드 청크 → 데이터 순서로 계단이 하나 더 생깁니다.

## 참고

- [TanStack Query — Performance & Request Waterfalls](https://tanstack.com/query/latest/docs/framework/react/guides/request-waterfalls)
- [TanStack Query — Prefetching & Router Integration](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching)
- [React — use](https://react.dev/reference/react/use)
