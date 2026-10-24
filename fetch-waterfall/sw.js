// /fetch-waterfall/api/* 요청을 가로채 지연 후 가짜 데이터를 돌려줍니다.
// 정적 서버만으로도 Network 탭에 실제 요청 막대가 보이게 하려는 장치입니다.
const DATA = {
  user: ['김당근', '이감자', '박고구마'],
  book: ['자바스크립트 완벽 가이드', '리팩터링 2판', '함께 자라기'],
  comment: ['잘 읽었어요', '예제가 좋아요', '다음 편 기다려요'],
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(/\/api\/(\w+)$/);
  if (!match) return;

  const delay = Number(url.searchParams.get('delay') ?? 600);
  event.respondWith(
    new Promise((resolve) => {
      setTimeout(() => resolve(Response.json(DATA[match[1]] ?? [])), delay);
    }),
  );
});
