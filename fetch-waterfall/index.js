import {
  createContext,
  createElement,
  Suspense,
  use,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

const html = htm.bind(createElement);
const NAMES = ['user', 'book', 'comment'];
const LABELS = { user: '사용자', book: '책', comment: '댓글' };

// 1. 요청 기록기: 시나리오를 실행할 때마다 새로 만듭니다.
function createTracker(delay) {
  const t0 = performance.now();
  const requests = [];
  const painted = {};
  const listeners = new Set();
  let snapshot = { requests: [], painted: {} };

  const emit = () => {
    snapshot = { requests: requests.map((r) => ({ ...r })), painted: { ...painted } };
    listeners.forEach((listener) => listener());
  };

  return {
    delay,
    async api(name) {
      const row = { name, start: performance.now() - t0, end: null };
      requests.push(row);
      emit();
      const res = await fetch(`./api/${name}?delay=${delay}`);
      const data = await res.json();
      row.end = performance.now() - t0;
      // Performance 탭 Timings 트랙에도 막대로 보이게 남깁니다.
      performance.measure(`api ${name}`, { start: t0 + row.start, end: t0 + row.end });
      emit();
      return data;
    },
    paint(name) {
      if (painted[name] != null) return;
      painted[name] = performance.now() - t0;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}

const TrackerContext = createContext(null);
const useTracker = () => useContext(TrackerContext);

// 2. 공통 화면 조각
function Section({ name, data }) {
  const tracker = useTracker();
  useEffect(() => {
    if (data) tracker.paint(name);
  }, [data]);

  if (!data) return html`<${Skeleton} name=${name} />`;
  return html`
    <div class="card">
      <h3>${LABELS[name]}</h3>
      <ul>${data.map((item) => html`<li key=${item}>${item}</li>`)}</ul>
    </div>
  `;
}

function Skeleton({ name, note }) {
  return html`<div class="card skeleton">${LABELS[name]} 불러오는 중…${note && html`<small>${note}</small>`}</div>`;
}

// useEffect 안에서 fetch하는 가장 기본적인 훅
function useApi(name) {
  const tracker = useTracker();
  const [data, setData] = useState(null);
  useEffect(() => {
    let ignore = false;
    tracker.api(name).then((result) => {
      if (!ignore) setData(result);
    });
    return () => {
      ignore = true;
    };
  }, [name]);
  return data;
}

// 3. 시나리오 — useEffect + fetch
function UserList() {
  return html`<${Section} name="user" data=${useApi('user')} />`;
}
function BookList() {
  return html`<${Section} name="book" data=${useApi('book')} />`;
}
function CommentList() {
  return html`<${Section} name="comment" data=${useApi('comment')} />`;
}

function SiblingEffects() {
  return html`<${UserList} /><${BookList} /><${CommentList} />`;
}

function SequentialAwait() {
  const tracker = useTracker();
  const [data, setData] = useState({});
  useEffect(() => {
    let ignore = false;
    (async () => {
      const user = await tracker.api('user');
      const book = await tracker.api('book');
      const comment = await tracker.api('comment');
      if (!ignore) setData({ user, book, comment });
    })();
    return () => {
      ignore = true;
    };
  }, []);
  return NAMES.map((name) => html`<${Section} key=${name} name=${name} data=${data[name]} />`);
}

function PromiseAll() {
  const tracker = useTracker();
  const [data, setData] = useState({});
  useEffect(() => {
    let ignore = false;
    Promise.all(NAMES.map((name) => tracker.api(name))).then(([user, book, comment]) => {
      if (!ignore) setData({ user, book, comment });
    });
    return () => {
      ignore = true;
    };
  }, []);
  return NAMES.map((name) => html`<${Section} key=${name} name=${name} data=${data[name]} />`);
}

function GatedEffects() {
  const user = useApi('user');
  // 이 return 때문에 BookList·CommentList는 user가 올 때까지 마운트되지 않습니다.
  if (!user) return html`<${Skeleton} name="user" note="책·댓글 컴포넌트는 아직 마운트 전" />`;
  return html`<${Section} name="user" data=${user} /><${BookList} /><${CommentList} />`;
}

// 화면 구조(사용자 먼저 보여주기)는 그대로 두고, 요청만 부모에서 한 번에 시작합니다.
function StartEarly() {
  const tracker = useTracker();
  const [promises] = useState(() => ({
    user: tracker.api('user'),
    book: tracker.api('book'),
    comment: tracker.api('comment'),
  }));
  return html`
    <${Suspense} fallback=${html`<${Skeleton} name="user" note="책·댓글 요청은 이미 출발" />`}>
      <${UserThenRest} promises=${promises} />
    <//>
  `;
}

function UserThenRest({ promises }) {
  const user = use(promises.user);
  return html`
    <${Section} name="user" data=${user} />
    <${Suspense} fallback=${html`<${Skeleton} name="book" />`}><${Await} name="book" promise=${promises.book} /><//>
    <${Suspense} fallback=${html`<${Skeleton} name="comment" />`}><${Await} name="comment" promise=${promises.comment} /><//>
  `;
}

function Await({ name, promise }) {
  return html`<${Section} name=${name} data=${use(promise)} />`;
}

// 4. 시나리오 — TanStack Query
function useApiQuery(name) {
  const tracker = useTracker();
  return useQuery({ queryKey: [name], queryFn: () => tracker.api(name) }).data;
}

function QueryList({ name }) {
  return html`<${Section} name=${name} data=${useApiQuery(name)} />`;
}

function SiblingQueries() {
  return NAMES.map((name) => html`<${QueryList} key=${name} name=${name} />`);
}

function GatedQueries() {
  const user = useApiQuery('user');
  if (!user) return html`<${Skeleton} name="user" note="책·댓글 컴포넌트는 아직 마운트 전" />`;
  return html`<${Section} name="user" data=${user} /><${QueryList} name="book" /><${QueryList} name="comment" />`;
}

const SCENARIOS = [
  {
    id: 'sibling-effect',
    group: 'useEffect + fetch',
    title: '형제 컴포넌트가 각자 요청',
    expect: '병렬',
    Comp: SiblingEffects,
    code: `<UserList />    // 각자 useEffect에서 fetch
<BookList />
<CommentList />`,
  },
  {
    id: 'sequential-await',
    group: 'useEffect + fetch',
    title: '한 effect 안에서 await 세 번',
    expect: '워터폴',
    Comp: SequentialAwait,
    code: `const user = await api('user');
const book = await api('book');       // user 끝나야 출발
const comment = await api('comment'); // book 끝나야 출발`,
  },
  {
    id: 'promise-all',
    group: 'useEffect + fetch',
    title: '한 effect 안에서 Promise.all',
    expect: '병렬',
    Comp: PromiseAll,
    code: `const [user, book, comment] = await Promise.all([
  api('user'), api('book'), api('comment'),
]);`,
  },
  {
    id: 'gated-effect',
    group: 'useEffect + fetch',
    title: '부모가 user를 받은 뒤 자식 마운트',
    expect: '워터폴',
    Comp: GatedEffects,
    code: `const user = useApi('user');
if (!user) return <Spinner />;   // ← 사실상 await
return <><UserList /><BookList /><CommentList /></>;`,
  },
  {
    id: 'start-early',
    group: 'useEffect + fetch',
    title: '같은 화면, 요청은 부모에서 먼저 시작',
    expect: '병렬',
    Comp: StartEarly,
    code: `const [p] = useState(() => ({
  user: api('user'), book: api('book'), comment: api('comment'),
}));
// 화면은 여전히 user 먼저. 자식은 use(p.book)로 읽기만`,
  },
  {
    id: 'sibling-query',
    group: 'TanStack Query',
    title: '형제 컴포넌트가 각자 useQuery',
    expect: '병렬',
    Comp: SiblingQueries,
    code: `<UserList />    // 각자 useQuery
<BookList />
<CommentList />`,
  },
  {
    id: 'gated-query',
    group: 'TanStack Query',
    title: 'isLoading 분기 아래 자식 useQuery',
    expect: '워터폴',
    Comp: GatedQueries,
    code: `const { data: user } = useQuery(['user']);
if (!user) return <Spinner />;
return <><BookList /><CommentList /></>; // 마운트돼야 요청`,
  },
  {
    id: 'prefetch-query',
    group: 'TanStack Query',
    title: '같은 구조 + 진입 전에 prefetchQuery',
    expect: '병렬',
    Comp: GatedQueries,
    prefetch: (queryClient, tracker) =>
      NAMES.forEach((name) =>
        queryClient.prefetchQuery({ queryKey: [name], queryFn: () => tracker.api(name) }),
      ),
    code: `// 라우트 loader나 클릭 핸들러에서 화면 진입 전에
NAMES.forEach((name) =>
  queryClient.prefetchQuery({ queryKey: [name], queryFn: () => api(name) }));
// 컴포넌트는 위와 똑같이 isLoading 분기`,
  },
];

// 5. 타임라인
function Timeline({ tracker }) {
  const { requests, painted } = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
  const ends = [...requests.map((r) => r.end ?? 0), ...Object.values(painted)];
  const scale = Math.max(tracker.delay * 3 + 300, ...ends);
  const done = NAMES.every((name) => painted[name] != null);
  const total = done ? Math.max(...NAMES.map((name) => painted[name])) : null;

  return html`
    <section class="timeline" aria-label="요청 타임라인">
      ${requests.map(
        (r) => html`
          <div class="lane" key=${r.name}>
            <span class="lane-name">${LABELS[r.name]}</span>
            <div class="track">
              <div
                class=${r.end == null ? 'bar pending' : 'bar'}
                style=${{
                  left: `${(r.start / scale) * 100}%`,
                  width: r.end == null ? '4px' : `${((r.end - r.start) / scale) * 100}%`,
                }}
              ></div>
              ${painted[r.name] != null &&
              html`<div class="paint" style=${{ left: `${(painted[r.name] / scale) * 100}%` }}></div>`}
            </div>
            <span class="lane-time">${Math.round(r.start)} → ${r.end == null ? '…' : Math.round(r.end)}ms</span>
          </div>
        `,
      )}
      <output>${done ? `세 영역이 모두 화면에 반영: ${Math.round(total)}ms` : '기다리는 중…'}</output>
    </section>
  `;
}

// 6. 앱
function App() {
  const [delay, setDelay] = useState(600);
  const [run, setRun] = useState(null);

  const start = (scenario) => {
    const tracker = createTracker(delay);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    scenario.prefetch?.(queryClient, tracker);
    setRun({ scenario, tracker, queryClient, key: performance.now() });
    history.replaceState(null, '', `?run=${scenario.id}&delay=${delay}`);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initial = SCENARIOS.find((s) => s.id === params.get('run'));
    const initialDelay = Number(params.get('delay'));
    if (initialDelay) setDelay(initialDelay);
    if (initial) setTimeout(() => start(initial));
  }, []);

  const groups = [...new Set(SCENARIOS.map((s) => s.group))];

  return html`
    <section class="controls">
      <label>
        API 하나당 지연
        <select value=${delay} onChange=${(e) => setDelay(Number(e.target.value))}>
          ${[300, 600, 1000].map((ms) => html`<option key=${ms} value=${ms}>${ms}ms</option>`)}
        </select>
      </label>
      ${groups.map(
        (group) => html`
          <fieldset key=${group}>
            <legend>${group}</legend>
            ${SCENARIOS.filter((s) => s.group === group).map(
              (s) => html`
                <button
                  key=${s.id}
                  class=${run?.scenario.id === s.id ? 'active' : ''}
                  onClick=${() => start(s)}
                >
                  ${s.title} <small>예상: ${s.expect}</small>
                </button>
              `,
            )}
          </fieldset>
        `,
      )}
    </section>

    ${run
      ? html`
          <section class="result">
            <h2>${run.scenario.title}</h2>
            <pre><code>${run.scenario.code}</code></pre>
            <${Timeline} tracker=${run.tracker} />
            <${QueryClientProvider} client=${run.queryClient}>
              <${TrackerContext.Provider} value=${run.tracker}>
                <div class="stage" key=${run.key}><${run.scenario.Comp} /></div>
              <//>
            <//>
          </section>
        `
      : html`<p class="guide">시나리오를 누르면 같은 세 API를 다시 요청합니다. 매번 캐시 없이 새로 시작해요.</p>`}
  `;
}

// StrictMode는 개발 중 effect를 두 번 실행해 요청이 두 번 보이므로 이 실험에서는 쓰지 않습니다.
async function boot() {
  await navigator.serviceWorker.register('./sw.js');
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
    );
  }
  createRoot(document.getElementById('root')).render(html`<${App} />`);
}

boot();
