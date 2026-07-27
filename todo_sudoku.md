Dưới đây là **Game Design Document (GDD)** và **Yêu cầu kỹ thuật chi tiết (Prompt Blueprint)** được thiết kế đặc biệt để bạn gửi cho AI Agent. Tài liệu này sẽ giúp AI hiểu rõ kiến trúc UI/UX từ bản gốc, đồng thời mở rộng logic một cách hệ thống để xử lý các kích thước bàn cờ (4x4, 6x6, 9x9) và chế độ chơi (Số/Màu) mà không gây ra lỗi (bug) về logic hay giao diện.

---

# YÊU CẦU LẬP TRÌNH: TRÒ CHƠI "ADVANCED SUDOKU: NUMBERS & COLORS"

## 1. Mục tiêu (Objective)

Xây dựng một trò chơi Sudoku bằng HTML/CSS/JS thuần (Single-page app hoặc các file rời). Kế thừa thiết kế UI/UX thanh lịch, thân thiện với lớp học (classroom-friendly) từ phiên bản `sudoku_color_4x4.html`. Nâng cấp toàn diện với khả năng chọn kích thước lưới (4x4, 6x6, 9x9) và chuyển đổi linh hoạt giữa chế độ hiển thị "Màu sắc" (Colors) và "Chữ số" (Numbers).

## 2. Kiến trúc Giao diện (UI/UX Architecture)

Giữ nguyên triết lý thiết kế của bản gốc: bo góc mềm mại, đổ bóng nhẹ, màu sắc tươi sáng.

* **Bố cục tổng thể (Layout):** Sử dụng `CSS Grid` dạng `1fr 320px` cho màn hình lớn, và xếp chồng (column) cho thiết bị di động `< 880px`.
* **Khu vực điều khiển (Header/Top):**
* Dropdown chọn **Grid Size**: `4x4`, `6x6`, `9x9`.
* Dropdown chọn **Difficulty**: `Easy`, `Medium`, `Hard`.
* Toggle/Radio chọn **Mode**: `Colors` hoặc `Numbers`.
* Nút `New Game` (Primary) và `Check` (Small).


* **Khu vực Bàn cờ (Board Panel):**
* Căn giữa. Khung viền ngoài (`.board-frame`) dùng `border` dày màu `#cfd8e3`.
* **BỎ cách dùng `::before`/`::after` để vẽ vạch ngăn cách đỏ** như bản cũ (vì không scale được lên 6x6, 9x9).
* **GIẢI PHÁP MỚI:** Sử dụng kiến trúc `.board` chứa các `.subgrid`.
* Với 4x4: `.board` chia thành lưới $2 \times 2$. Mỗi ô `.subgrid` chứa lưới $2 \times 2$ `.cell`.
* Với 6x6: `.board` chia thành lưới $3 \times 2$ (3 cột, 2 hàng). Mỗi ô `.subgrid` chứa lưới $2 \times 3$ `.cell`.
* Với 9x9: `.board` chia thành lưới $3 \times 3$. Mỗi ô `.subgrid` chứa lưới $3 \times 3$ `.cell`.


* Khoảng cách (Gap): Giữa `.board` là `var(--subbox-gap)` (ví dụ 4px, màu nền tối để tạo viền đậm), giữa các `.cell` trong `.subgrid` là `var(--gap)` (ví dụ 1px, viền mờ).


* **Khu vực Palette & Tools (Sidebar):**
* Hiển thị linh hoạt số lượng `.color-tile` (4, 6, hoặc 9 block) dựa trên Grid Size.
* Công cụ: `Eraser`, `Reveal (Solve)`.
* Trạng thái (Status/Hint): Hướng dẫn hoặc báo lỗi real-time.



## 3. Game Mechanics & Logic (Quy tắc trò chơi)

### 3.1. Chế độ hiển thị (View Modes)

* **Color Mode:** `.cell` và `.color-tile` không hiện chữ số (hoặc hiện mờ). Sử dụng `background: linear-gradient` theo map màu.
* *Color Map (1-9):* 1:Đỏ, 2:Xanh dương, 3:Xanh lá, 4:Cam, 5:Tím, 6:Vàng, 7:Hồng, 8:Xanh lơ (Cyan), 9:Nâu nhạt.


* **Number Mode:** `.cell` và `.color-tile` có background trắng/xám nhạt, hiện text số (1-9) to, rõ ràng, font weight 700. Màu text của ô cố định (locked) là Đen/Xám đậm, màu text của người chơi điền là Xanh dương (`#2749d9`).

### 3.2. Tương tác (Interactions)

Hỗ trợ cả 2 phương thức:

1. **Drag & Drop:** Kéo từ Palette thả vào ô trống trên Board. Ô trống đổi style `.drag-over` khi hover.
2. **Click & Place (Select mode):** Click vào 1 tile trên Palette (tile được highlight). Sau đó click vào bất kỳ ô trống nào trên Board để điền. Click lại vào Palette tile để bỏ chọn.
3. **Xoá (Erase):**
* Click nút Eraser -> Click vào ô cần xoá.
* Right-click (Click chuột phải / Context menu) vào ô trống để xoá nhanh.



### 3.3. Thuật toán Sudoku (Quan trọng)

*Không dùng mảng hardcode sẵn vì 6x6 và 9x9 có hàng tỷ khả năng.* Yêu cầu Agent viết thuật toán tạo Sudoku động:

1. **Generate:** Điền các khối vuông đường chéo chính (hoàn toàn độc lập). Sau đó dùng thuật toán **Backtracking** để giải (điền đầy) các ô còn lại -> Tạo ra `solutionBoard`.
2. **Dig (Đục lỗ):** Dựa vào độ khó (Easy/Medium/Hard) và Kích thước (4/6/9), xoá đi số lượng ô `K` tương ứng để tạo `puzzleBoard`. Đánh dấu các ô không bị xoá là `locked = true`.

---

## 4. Gợi ý Code & Kỹ thuật cho AI Agent (Hints for Execution)

> **[Prompt for AI]** "Use the following CSS structure and JavaScript logic to build the application. Minimize errors by strictly following this DOM architecture."

### 4.1. Cấu trúc CSS linh hoạt cho Bàn cờ (Dynamic Grid CSS)

```css
/* Khai báo CSS Variables chung */
:root {
  --cell-size: 50px; /* Sẽ điều chỉnh bằng JS tuỳ theo 4x4, 6x6 hay 9x9 */
  --board-bg: #2a2a2a; /* Màu nền lộ ra làm viền đậm giữa các subgrid */
  --subbox-gap: 3px; 
  --cell-gap: 1px;
}

/* Board chứa các Subgrid */
.board {
  display: grid;
  gap: var(--subbox-gap);
  background: var(--board-bg); /* Tạo viền chia khu vực rõ ràng thay vì dùng ::before/after */
  border: 3px solid var(--board-bg);
  border-radius: 4px;
}

/* Cấu hình Grid Layout thay đổi theo class */
.board.size-4 { grid-template-columns: repeat(2, auto); }
.board.size-6 { grid-template-columns: repeat(2, auto); } /* 2 cột x 3 hàng block */
.board.size-9 { grid-template-columns: repeat(3, auto); }

/* Lưới con (Subgrid) */
.subgrid {
  display: grid;
  gap: var(--cell-gap);
  background: #ccc; /* Nền của subbox, lộ ra làm viền mờ giữa các cell */
}

/* Cấu hình Subgrid theo size */
.board.size-4 .subgrid { grid-template-columns: repeat(2, var(--cell-size)); }
.board.size-6 .subgrid { grid-template-columns: repeat(3, var(--cell-size)); } /* Khối 3x2 */
.board.size-9 .subgrid { grid-template-columns: repeat(3, var(--cell-size)); }

.cell {
  width: var(--cell-size);
  height: var(--cell-size);
  background: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: bold; font-size: 20px;
  cursor: pointer; transition: all 0.2s;
  color: #333; /* Text cố định */
}
.cell.player-fill {
  color: #2749d9; /* Text người chơi nhập */
}

```

### 4.2. Khởi tạo Bàn cờ (JavaScript Logic)

```javascript
/**
 * @param {number} size Kích thước bàn (4, 6, 9)
 * @param {string} difficulty Mức độ ('easy', 'medium', 'hard')
 */
function createGridData(size, difficulty) {
  // Tạo ma trận NxN
  let board = Array(size).fill(0).map(() => Array(size).fill(0));
  
  // Logic tạo Sudoku Backtracking (Yêu cầu AI Agent tự hoàn thành hàm này)
  // function fillBoard() {} -> return solvedBoard;
  // function removeKDigits() {} -> return puzzleBoard;
  
  // ... Logic ...
  
  return { solvedBoard, puzzleBoard, lockedCells: [] };
}

/**
 * Hàm render UI theo mảng cấu trúc
 */
function renderBoardDOM(size, puzzleBoard) {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = ''; // Clear
  boardEl.className = `board size-${size}`; // Set class để đổi style CSS Grid
  
  let subgridRows, subgridCols;
  if(size === 4) { subgridRows = 2; subgridCols = 2; }
  if(size === 6) { subgridRows = 2; subgridCols = 3; } // Khối 2 dòng, 3 cột
  if(size === 9) { subgridRows = 3; subgridCols = 3; }

  const subgrids = [];
  // Tạo các Wrapper Subgrid
  for(let i=0; i<size; i++) {
    const sub = document.createElement('div');
    sub.className = 'subgrid';
    boardEl.appendChild(sub);
    subgrids.push(sub);
  }

  // Chèn Cell vào đúng Subgrid
  for(let r=0; r<size; r++) {
    for(let c=0; c<size; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      
      // Tính toán subgridIndex
      const sr = Math.floor(r / subgridRows);
      const sc = Math.floor(c / subgridCols);
      const subgridIndex = sr * (size / subgridCols) + sc;
      
      // Setup Event Listeners (Drag, Drop, Click...)
      // ... Event Binding ...
      
      subgrids[subgridIndex].appendChild(cell);
    }
  }
}

```

### 4.3. Palette Động & Chế độ Màu/Số (Dynamic Palette & Modes)

* Tạo biến CSS `--palette-size` thu nhỏ lại khi lên 9x9 để vừa Sidebar.
* Khi chuyển đổi `Mode` (Numbers/Colors), dùng JavaScript `.classList.add('mode-color')` hoặc `.classList.add('mode-number')` vào `<body>`.
* CSS cho Mode:
```css
body.mode-color .cell, body.mode-color .color-tile {
    color: transparent; /* Giấu text */
}
body.mode-number .cell, body.mode-number .color-tile {
    background: #fff; /* Xoá gradient màu, chỉ để text */
    border: 2px solid #ddd;
}
/* Các class màu (col-1 đến col-9) chỉ có tác dụng khi ở mode-color hoặc background gốc */
.col-1 { background: linear-gradient(...); } /* Red */
.col-9 { background: linear-gradient(...); } /* Brown */

```



---

## 5. Tổng kết Yêu cầu (Checklist for AI)

1. Bỏ cách dùng `::before` / `::after` để vẽ vạch, chuyển sang mô hình `div.board > div.subgrid > div.cell` và dùng `gap` của CSS Grid để chia tách (giúp code sạch và scale được).
2. Thuật toán sinh Sudoku tự động bằng Backtracking (không hardcode). Có hàm kiểm tra tính hợp lệ (`isValid(board, row, col, num)`).
3. Cập nhật tính năng chuyển đổi Number Mode / Color Mode real-time bằng nút bấm/toggle.
4. Kế thừa thiết kế Responsive (Wrap lưới chuyển cột trên mobile), Drag & Drop logic, Event Listener (click, dragover) từ mã nguồn gốc. Mở rộng UI để hỗ trợ bảng Palette lên tới 9 màu/số.
5. Popup Modal hoàn thành game với thống kê cơ bản.

Dưới đây là phần bổ sung chi tiết về Hệ thống Seed ID để bạn ghép vào tài liệu GDD (Game Design Document) ở trên. Việc thêm Seed ID đòi hỏi AI Agent phải thay đổi cách tạo số ngẫu nhiên mặc định của JavaScript.

Bổ sung vào Phần 2: Kiến trúc Giao diện (UI/UX Architecture)
Khu vực Chia sẻ & Chơi chung (Seed System UI): Thêm một hàng công cụ nhỏ (hoặc nằm gọn trong Header/Sidebar).

Current Seed: Hiển thị mã màn chơi hiện tại (Ví dụ: 9-H-A7B2X). Có nút copy (biểu tượng 📋) bên cạnh để sao chép nhanh.

Play from Seed: Một input field nhỏ để dán mã Seed của người khác, kèm nút Load/Play.

URL Parameter: Khuyến khích hỗ trợ đọc tham số từ URL (?seed=...) để chia sẻ link trực tiếp thay vì chỉ copy mã.

Bổ sung vào Phần 3: Game Mechanics & Logic (Quy tắc trò chơi)
3.4. Hệ thống Seed ID (Hạt giống màn chơi):

Cấu trúc mã Seed: Một mã Seed hợp lệ nên chứa đủ thông tin để tái tạo lại chính xác màn chơi. Gợi ý format: {Size}-{Difficulty}-{RandomNumber}.

Size: 4, 6, 9.

Difficulty: E (Easy), M (Medium), H (Hard).

RandomNumber: Một chuỗi số học hoặc alphanumeric (VD: 12345 hoặc A7B2X).

Ví dụ: 9-H-12345 nghĩa là Sudoku 9x9, Hard, sinh từ thuật toán với chuỗi ngẫu nhiên "12345".

Tính đồng nhất: Hai người chơi nhập cùng một mã Seed phải có cùng một cấu trúc lưới (cùng đáp án) và cùng các ô trống được đục lỗ ở vị trí y hệt nhau.

Bổ sung vào Phần 4: Gợi ý Code & Kỹ thuật cho AI Agent (Hints for Execution)
[Prompt for AI] "Implement a Seedable PRNG (Pseudo-Random Number Generator) system. DO NOT use Math.random() for puzzle generation, as it cannot be seeded. Use the provided Mulberry32 or LCG PRNG algorithm below to ensure two users with the same Seed ID get the exact same Sudoku board and pre-filled cells."

4.4. Kỹ thuật sinh PRNG & Quản lý Seed
JavaScript
/**
 * 1. Hàm tạo số ngẫu nhiên có thể Seed (Mulberry32 PRNG)
 * Thay thế toàn bộ Math.random() trong thuật toán Sudoku bằng hàm rng() này.
 */
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// Biến toàn cục quản lý hàm random hiện tại
let currentPRNG;

/**
 * 2. Hàm khởi tạo Game với Seed
 * Nếu có customSeed (người dùng nhập), phân tích nó.
 * Nếu không, tự động sinh một mã Seed mới.
 */
function initializeGameWithSeed(customSeedString) {
    let size, difficulty, seedNumber;

    if (customSeedString) {
        // Phân tích mã Seed (VD: "9-H-12345")
        const parts = customSeedString.split('-');
        if(parts.length === 3) {
            size = parseInt(parts[0]);
            difficulty = parts[1] === 'E' ? 'easy' : parts[1] === 'M' ? 'medium' : 'hard';
            seedNumber = parseInt(parts[2]); // Hoặc dùng hash function nếu seed là chữ
        }
    } else {
        // Tạo Seed ngẫu nhiên nếu bắt đầu game mới
        size = document.getElementById('sizeSelect').value;
        const diffText = document.getElementById('diffSelect').value;
        difficulty = diffText.charAt(0).toUpperCase(); // 'E', 'M', 'H'
        seedNumber = Math.floor(Math.random() * 999999); 
        
        // Tạo chuỗi UI Seed
        customSeedString = `${size}-${difficulty}-${seedNumber}`;
    }

    // Hiển thị mã Seed lên UI cho người chơi copy
    document.getElementById('currentSeedDisplay').textContent = customSeedString;

    // Khởi tạo PRNG với hạt giống bằng số
    currentPRNG = mulberry32(seedNumber);

    // Chạy thuật toán tạo Sudoku: 
    // TRONG THUẬT TOÁN ĐÓ, bắt buộc dùng currentPRNG() thay vì Math.random()
    // Ví dụ: const randomIndex = Math.floor(currentPRNG() * array.length);
    const puzzleData = createGridData(size, difficulty, currentPRNG);
    renderBoardDOM(size, puzzleData);
}