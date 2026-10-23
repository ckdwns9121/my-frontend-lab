// 1. 주문 데이터 1000개 만들기
const data = Array.from({ length: 1000 }, (_, index) => `주문 ${index + 1}`);



// 2. 첫 화면 그리기
const rows = document.getElementById('rows');


const bottomSpacer = document.getElementById('bottom-spacer');


const topSpacer = document.getElementById('top-spacer');

const viewport = document.getElementById('viewport');

viewport.addEventListener('scroll',updateList)

const rowNodes = new Map();

// TODO 1: 여기서 앞뒤로 미리 그릴 행 개수를 정하세요. 예: overscan = 2

const OVER_SCAN = 2;

function updateList(){
    const scrollTop=viewport.scrollTop;
    const clientHeight= viewport.clientHeight;

;
    const start = Math.floor(scrollTop /50);
    const end = Math.min(
        data.length,
        Math.ceil((scrollTop + clientHeight) / 50)
    );

    // TODO 2: start와 end는 보이는 범위로 두고, 여기서 렌더링 범위를 더 넓히세요.
    // renderStart: start에서 overscan을 빼되, 0보다 작아지지 않게 계산
    // renderEnd: end에 overscan을 더하되, data.length를 넘지 않게 계산

    const renderStart = Math.max(0, start - OVER_SCAN);
    const renderEnd = Math.min(data.length, end + OVER_SCAN);

    console.log(start,end)

    // TODO 3: 아래 세 함수에 start/end 대신 renderStart/renderEnd를 전달하세요.
    // 실제 행을 더 그린 만큼 위아래 빈 공간도 줄어야 하므로 같은 범위를 사용합니다.
    updateTopSpacer(renderStart);
    updateBottomSpacer(renderEnd);
    updateRows(renderStart,renderEnd);
}

function updateTopSpacer(start){
    topSpacer.style.height = `${start * 50}px`;
}

function updateBottomSpacer(end){
    bottomSpacer.style.height = `${(data.length - end) * 50}px`;
}

function updateRows(start,end){


    for (const [index,row] of rowNodes){

        if(index < start){
            row.remove();
            rowNodes.delete(index);
        } else if (index >= end) {
            row.remove();
            rowNodes.delete(index);
        }
    }

    let cursor = rows.firstElementChild;

    for(let i= start; i<end;i++){
        let row = rowNodes.get(i);

        // row 없을때는 row 생성
        if(!row){
            row = document.createElement('div');
            row.className = "row";
            row.textContent = data[i];
            rowNodes.set(i,row);
        }

        // 현재 커서가 row라면 커서 다음 형제로 이동
        if (cursor === row){
            cursor = cursor.nextElementSibling;
            continue;
        }

        if (cursor){
            rows.insertBefore(row,cursor);
        } else {
            rows.appendChild(row);
        }
        cursor = row.nextElementSibling;
    }

}

updateList();
