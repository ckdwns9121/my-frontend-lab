// 1. 주문 데이터 1000개 만들기
const data = Array.from({ length: 1000 }, (_, index) => `주문 ${index + 1}`);



// 2. 첫 화면 그리기
const rows = document.getElementById('rows');


const bottomSpacer = document.getElementById('bottom-spacer');


const topSpacer = document.getElementById('top-spacer');

const viewport = document.getElementById('viewport');

viewport.addEventListener('scroll',updateList)

const rowNodes = new Map();

function updateList(){
    const scrollTop=viewport.scrollTop;
    const clientHeight= viewport.clientHeight;

    const start = Math.floor(scrollTop /50);
    const end = Math.min(
        data.length,
        Math.ceil((scrollTop + clientHeight) / 50)
    );

    console.log(start,end)

    updateTopSpacer(start);
    updateBottomSpacer(end);
    updateRows(start,end);
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
