Chào bạn, mình là Gemini. Đây là một dự án game giáo dục rất thú vị và có cấu trúc rõ ràng. Việc bạn chuẩn bị kỹ lưỡng một bản đặc tả (Prompt/PRD) chi tiết sẽ giúp các agent AI (như Cursor, Claude, hay chính mình khi viết code) hiểu chính xác context, giảm thiểu tối đa "hallucination" (bịa code) và lỗi logic.

Dưới đây là **Tài liệu Đặc tả Yêu cầu Game (Game Requirements Specification)** được viết dưới định dạng Markdown, tối ưu hóa cho AI Agent đọc hiểu. Bạn chỉ cần copy toàn bộ nội dung trong khối code bên dưới và gửi cho AI Agent của bạn.

---

```markdown
# GAME SPECIFICATION: "FIND THE THING" (TÌM ĐỒ VẬT)
**Ngôn ngữ:** Tiếng Việt
**Đối tượng:** Trẻ em tiểu học (Giao diện dễ thương, hội thoại thân thiện, font chữ dễ đọc).
**Mục tiêu:** Giúp AI Agent hiểu rõ kiến trúc, UI/UX, Game Flow và Logic để tạo ra file `find_the_thing.html` (kèm JS/CSS nội bộ hoặc tách file) hoàn chỉnh, ít bug nhất.

---

## 1. Cấu trúc thư mục (Directory Structure)
Dự án chạy hoàn toàn trên trình duyệt (Client-side).
```text
/ (Root)
├── find_the_thing.html (Chứa HTML, CSS, JS)
└── things/
    ├── 1.png đến 37.png (Vật phẩm, 1000x1000, transparent)
    ├── John.png, Mary.png, Tom.png, Anna.png, Mike.png (Avatar, 1000x1000, transparent)
    └── Lucy.png, Jack.png, Emma.png, Paul.png, Kate.png

```

---

## 2. Giao diện người dùng (UI/UX Layout)

Giao diện chia làm 3 lớp chính (z-index từ thấp đến cao: GameZone -> Bottom Panel -> Top Control). Thích ứng mọi màn hình (Responsive).

### 2.1. Top Control Panel (Thanh cài đặt)

* **Vị trí:** Cố định (Fixed/Absolute) ở trên cùng, z-index cao.
* **Bố cục:** 1 row duy nhất, các phần tử xếp từ góc phải dồn sang trái (`flex-direction: row-reverse`).
* **Thành phần (Dùng Emoji làm icon):**
* Toggle Nhãn Gợi Ý (🏷️ On/Off).
* Số lượt khách (🧑‍🤝‍🧑): `[-] [Số] [+]`
* Thời gian/lượt (⏱️ giây): `[-] [Số] [+]`
* Số lần đoán sai tối đa (❌): `[-] [Số] [+]`
* Số đồ/ngăn (Cột - ↔️): `[-] [Số] [+]`
* Số ngăn tủ (Hàng - ↕️): `[-] [Số] [+]`


* **Hành vi:** Bất kỳ thay đổi nào cũng lập tức reset game về trạng thái "Chuẩn bị", xáo trộn lại đồ vật trên kệ. Lưu các thông số này vào `localStorage`.

### 2.2. Center Game Zone (Khu vực chơi)

* **Kích thước:** Chiếm toàn bộ màn hình (`100vw`, `100vh`). Tràn dưới Top Control và Bottom Panel.
* **Tương tác:**
* Khóa Click phải chuột (Disable context menu).
* Khóa double-tap to zoom trên mobile (`touch-action: none` hoặc prevent default).
* Hỗ trợ Pan (kéo thả để di chuyển camera) và Zoom (cuộn chuột hoặc pinch-to-zoom trên cảm ứng).


* **Hiển thị Tủ đồ (Cabinet):**
* Vẽ tủ đồ dạng lưới (Grid). Default: 3 hàng x 3 cột.
* Mỗi ô chứa 1 ảnh random từ `1.png` - `37.png` (không trùng lặp nếu số ô <= 37, nếu > 37 thì cho phép trùng).
* Bên dưới mỗi ảnh có Label số thứ tự (1, 2, 3...) font chữ to, rõ.
* Nhãn định hướng (Toggleable): Chữ "Trái", "Phải" ở 2 bên mép tủ. "Trên", "Dưới" ở mép trên/dưới tủ.


* **Auto-Zoom Logic (QUAN TRỌNG):**
* Khi thay đổi số lượng ngăn/đồ, kích thước gốc của mỗi món đồ KHÔNG đổi.
* Thay vào đó, tự động tính toán scale (CSS Transform Scale) để toàn bộ tủ đồ + các nhãn định hướng nằm gọn trong vùng hiển thị an toàn (Safe Area: Nằm giữa Top Control và Bottom Panel, không bị che khuất).



### 2.3. Bottom Floating Panel (Bảng hội thoại phong cách Win 11)

* **Vị trí:** Nổi ở cạnh dưới màn hình, căn giữa.
* **UI Style (Win 11):** Nền bán trong suốt (`backdrop-filter: blur(10px)`), đổ bóng nhẹ (`box-shadow`), bo góc tròn, viền mỏng (`border: 1px solid rgba(255,255,255,0.2)`). Hiệu ứng sáng nhẹ khi hover.
* **Thành phần:**
* Avatar nhân vật (bên trái).
* Khung text hội thoại (bên phải).
* Trong trạng thái "Chuẩn bị", hiển thị nút "Mở Cửa Hàng 🏪" to, rõ ràng ở giữa.



---

## 3. Game Flow (Luồng trò chơi)

1. **Trạng thái Chuẩn bị (Preparation):**
* Tủ đồ được render dựa trên thông số hiện tại (từ `localStorage` hoặc mặc định 3x3). Đồ vật ngẫu nhiên.
* Bottom panel chỉ hiện nút "Mở Cửa Hàng". Tương tác click đồ vật bị vô hiệu hóa.


2. **Khởi động (Start):**
* Bấm "Mở Cửa Hàng" -> Phát SFX chuông cửa -> Đóng băng Top Control (không cho đổi setting).
* Bắt đầu vòng lặp ca làm việc.


3. **Vòng lặp Khách hàng (Customer Loop):**
* Chọn ngẫu nhiên 1 Avatar, ngẫu nhiên 1 món đồ đang có trên tủ làm "Mục tiêu".
* Sinh câu hội thoại dựa trên toạ độ món đồ mục tiêu. Render Avatar và Text ra Bottom Panel.
* Bắt đầu đếm ngược thời gian (thể hiện qua thanh progress bar nhỏ ở bottom panel).
* **Người chơi click vào 1 món đồ:**
* **ĐÚNG & Nhanh (< 20% thời gian):** Avatar khen ngợi nhiệt tình. Đồ vật biến mất khỏi kệ. SFX đúng.
* **ĐÚNG & Bình thường:** Avatar cảm ơn. Đồ vật biến mất.
* **SAI:** Trừ 1 lượt đoán sai. Avatar nhắc lại yêu cầu. Đồ vật giữ nguyên. SFX sai.
* **HẾT GIỜ hoặc HẾT LƯỢT ĐOÁN SAI:** Khách phàn nàn nhẹ, rời đi. Đồ vật giữ nguyên.


* Đợi 2 giây (delay), dọn dẹp panel, phát SFX bước chân/đóng cửa. Chuyển sang khách tiếp theo.


4. **Kết thúc ca làm (End Shift):**
* Hết số khách -> Bottom panel hiện "Trời tối rồi, đóng cửa hàng thôi 🌙".
* Hiện Popup Tổng kết (Summary Popup):
* Số đơn thành công / thất bại.
* Danh sách lưới: [Avatar] + [Đồ mua thành công] HOẶC [Đồ chọn sai có dấu X đỏ] HOẶC [Trống nếu hết giờ].
* Nút "Chơi lại" -> Xáo trộn kệ tủ, về trạng thái 1 (chuẩn bị).





---

## 4. Kịch bản Hội thoại (Visual Novel Style)

*Agent cần viết một function `generateDialogue(row, col, maxRow, maxCol, avatarName)` để random ra các mẫu câu sau:*

Đồng thời bổ sung thêm những câu thoại tương đương. Các cụm từ vị trí được tô đậm nổi bật để dễ đọc ra ngay.

* **Trường hợp các góc (Corners):**
* `[Avatar] đang tìm món đồ ở [góc trên cùng bên trái] của tủ. Lấy giúp mình nha!`
* `Bạn của [Avatar] nhờ mua món ở [góc phải xa nhất] của [kệ dưới cùng].`


* **Trường hợp Toạ độ thông thường (Row/Col):**
* *Mẫu 1:* `Lấy cho [Avatar] món đồ nằm ở kệ thứ [row] từ trên xuống, món thứ [col] từ trái qua nhé.`
* *Mẫu 2:* `[Avatar] đang cần lấy món ở kệ thứ [maxRow - row + 1] từ dưới lên, là món thứ [maxCol - col + 1] từ bên phải qua.`
* *Mẫu 3:* `Phiền bạn lấy giúp [Avatar] món đồ ở kệ thứ [row], vị trí thứ [col] tính từ bên trái nha.`


* **Phản ứng Đoán Sai:**
* *Mẫu 1:* `Ôi, bạn chọn sai rồi. [Avatar] cần món này cơ: \n [Lặp lại câu yêu cầu]`
* *Mẫu 2:* `[Avatar] đâu có mua món này, mình chọn món kia kìa: \n [Lặp lại câu yêu cầu]`
* *(Khi chọn sai, đổi màu viền Bottom Panel sang cam/đỏ nhạt).*


* **Phản ứng Đoán Đúng (< 20% thời gian):**
* `Oa! Bạn tinh mắt quá! Lần sau phát huy tốc độ này nhé!`
* `Bạn tìm nhanh như chớp vậy! Cảm ơn bạn nhiều nha!`


* **Phản ứng Hết giờ:**
* `Trễ giờ mất rồi, mẹ đang đợi, [Avatar] đành qua cửa hàng khác vậy...`



---

## 5. Cấu trúc dữ liệu & Code Snippet tham khảo

### 5.1. Dữ liệu trạng thái

```javascript
let gameState = {
    status: 'PREPARING', // PREPARING, PLAYING, ENDED
    settings: {
        rows: 3, cols: 3, customers: 5, timeLimit: 30, maxMistakes: 3
    },
    cabinet: [], // Mảng 2 chiều lưu object { id, img, row, col }
    currentCustomer: null, // { avatar, targetItem, mistakesMade, timeRemaining }
    history: [] // Lưu kết quả để show Popup { avatar, targetItem, pickedItem, status }
};

```

### 5.2. Auto-Zoom Logic (Gợi ý)

```javascript
function updateAutoZoom() {
    const gameZone = document.getElementById('game-zone');
    const cabinetArea = document.getElementById('cabinet-area');
    const topPanelHeight = document.getElementById('top-control').offsetHeight;
    const bottomPanelHeight = document.getElementById('bottom-panel').offsetHeight;
    
    // Tính toán vùng an toàn
    const safeHeight = window.innerHeight - topPanelHeight - bottomPanelHeight - 60; // 60px padding
    const safeWidth = window.innerWidth - 60;

    const cabinetRect = cabinetArea.getBoundingClientRect(); // Kích thước thực của tủ khi scale = 1
    const originalWidth = cabinetArea.offsetWidth;
    const originalHeight = cabinetArea.offsetHeight;

    const scaleX = safeWidth / originalWidth;
    const scaleY = safeHeight / originalHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Không zoom to hơn kích thước gốc

    // Sử dụng CSS transform để scale cabinet, đặt transform-origin là center
    cabinetArea.style.transform = `scale(${scale})`;
}
// Gọi hàm này mỗi khi window.resize hoặc thay đổi cấu hình tủ.

```

### 5.3. LocalStorage Logic

```javascript
function loadSettings() {
    const saved = localStorage.getItem('findTheThingSettings');
    if (saved) gameState.settings = JSON.parse(saved);
    // Cập nhật lên UI...
}
function saveSettings() {
    localStorage.setItem('findTheThingSettings', JSON.stringify(gameState.settings));
}

```

---

## 6. To-Do List cho AI Agent

AI Agent vui lòng thực hiện từng bước sau để hoàn thiện code:

1. **Thiết lập HTML/CSS cơ bản:** Tạo file HTML, thiết lập CSS Reset, định nghĩa CSS Variables cho màu sắc (Tone màu sáng, thân thiện trẻ em).
2. **Xây dựng Layout:** Top Control (Flexbox), Game Zone (Position Relative, overflow hidden), Bottom Panel (Glassmorphism / Win 11 style), Popup Template (Hidden by default).
3. **Hệ thống Cài đặt (Settings):** Khởi tạo JS kết nối các nút `+`/`-`, input. Viết hàm sinh cấu trúc mảng lưới `gameState.cabinet` và random ảnh từ 1->25.png. Lưu LocalStorage.
4. **Hệ thống Render (View):** Viết hàm vẽ tủ đồ từ `gameState.cabinet`. Gắn CSS Grid cho tủ. Thêm các Label (1..N) cho từng item. Thêm Label định hướng (Trái/Phải/Trên/Dưới).
5. **Cơ chế Zoom/Pan:** Lắng nghe sự kiện `mousedown`, `mousemove`, `mouseup`, `wheel`, `touchstart`, `touchmove` trên GameZone để kéo thả và zoom tủ đồ. Áp dụng logic Auto-Zoom khi khởi tạo/resize màn hình.
6. **Luồng Core Game:** * Hàm `startGame()`.
* Hàm `nextCustomer()`: Random khách, random mục tiêu đang có trên kệ, sinh text hội thoại, bắt đầu timer đếm ngược (`requestAnimationFrame` hoặc `setInterval`).
* Hàm xử lý sự kiện `click` vào vật phẩm: So sánh ID vật phẩm với ID mục tiêu. Xử lý logic Thắng/Thua/Trừ điểm.


7. **Âm thanh (SFX):** (Optional, dùng Audio API sinh tiếng bíp đơn giản nếu không có file âm thanh gốc).
8. **Màn hình Kết thúc:** Hàm `showSummaryPopup()`, render danh sách lịch sử khách hàng.
9. **Đánh bóng (Polishing):** Hiệu ứng CSS transitions, shake effect khi đoán sai, hover effect.

---

## 7. Lưu ý cực kỳ quan trọng & Quy trình tự Test (Self-Testing)

* **Tránh chồng chéo UI:** Phải chắc chắn vùng tủ đồ có z-index thấp hơn control panel và bottom panel. Auto-zoom phải tính toán KHÔNG để các item bị bottom panel che khuất (rất hay gặp).
* **Chống double-tap zoom trên iOS/Android:** Trong CSS của body/game-zone, bắt buộc thêm `touch-action: none; user-select: none; -webkit-user-select: none;`.
* **Label tỷ lệ thuận:** Khi cabinet bị thu nhỏ bởi `transform: scale`, các label số 1,2,3 và nhãn trái/phải sẽ bị nhỏ theo. Điều này là CHẤP NHẬN ĐƯỢC (như yêu cầu), nhưng font size ban đầu của label phải đủ lớn (VD: `font-size: 3rem`) để khi scale xuống vẫn đọc được.
* **Dịch chuỗi vị trí chính xác:** Agent cần cẩn thận hàm `generateDialogue`. Ví dụ hàng thứ 2 từ dưới lên trong mảng `maxRow = 3` thì index là `row = 1` (0-indexed). Cần tính toán toán học chính xác.

```

```
Bổ sung rất tinh tế! Chế độ tối (Dark Mode) và độ tương phản màu sắc không chỉ giúp bảo vệ mắt mà còn làm giao diện trở nên chuyên nghiệp, thân thiện hơn rất nhiều, đặc biệt là với các bé học sinh tiểu học thường có sự nhạy cảm cao với màu sắc và ánh sáng màn hình.

Để Agent AI hiểu rõ cách thiết lập biến màu (CSS Variables) và logic chuyển đổi hai chế độ sáng/tối, bạn chỉ cần copy thêm đoạn Markdown dưới đây và nối vào phần cuối của tài liệu đặc tả ban đầu nhé.

---

```markdown
## 8. Bảng màu & Chế độ Tối (Color Palette & Dark Mode)
**Yêu cầu cốt lõi:** Dùng biến CSS (`CSS Variables`) trong `:root` để quản lý toàn bộ hệ thống màu sắc. Hỗ trợ tự động nhận diện theo hệ thống (`@media (prefers-color-scheme: dark)`) và một nút Toggle thủ công trên thanh Top Control (icon 🌞/🌙).

### 8.1. Chế độ Sáng (Light Mode - Mặc định)
Tông màu chủ đạo là sự tươi sáng, dễ thương, mô phỏng tủ gỗ sáng màu và không gian cửa hàng tiện lợi ban ngày.
* **Màu nền Web (Game Zone):** Xanh dương nhạt hoặc vàng nhạt pastel (`#F0F8FF` hoặc `#FFFACD`).
* **Màu Tủ đồ (Cabinet):** Màu gỗ sồi sáng (`#DEB887` hoặc `#D2B48C`).
* **Viền tủ & Ngăn chia:** Nâu gỗ đậm (`#8B4513`) để tạo khối 3D nhẹ.
* **Màu Text chung:** Đen xám (`#333333`) để dễ đọc.
* **Màu nền Nhãn dán (Label số 1, 2, 3...):** Trắng đục (`rgba(255, 255, 255, 0.8)`), chữ màu đen hoặc nâu đậm, bo góc tròn.
* **Bottom Panel (Win 11 Glass):** Nền trắng bán trong suốt (`rgba(255, 255, 255, 0.6)`), viền trắng mỏng. Chữ màu xám đậm (`#222`).

### 8.2. Chế độ Tối (Dark Mode)
Tông màu dịu mắt, mô phỏng cửa hàng buổi tối, độ tương phản vừa đủ để học sinh đọc rõ mà không bị chói.
* **Màu nền Web (Game Zone):** Xanh đen sẫm hoặc xám đen (`#1A1A2E` hoặc `#121212`).
* **Màu Tủ đồ (Cabinet):** Gỗ sồi tối màu hoặc nâu trầm (`#3E2723` hoặc `#4E342E`).
* **Viền tủ & Ngăn chia:** Nâu đen sẫm (`#1B0000`) hoặc xám viền dạ quang nhẹ.
* **Màu Text chung:** Trắng ngà hoặc xám sáng (`#E0E0E0`).
* **Màu nền Nhãn dán (Label):** Đen bán trong suốt (`rgba(0, 0, 0, 0.6)`), chữ màu trắng ngà hoặc vàng nhạt (`#FFD54F`) để nổi bật.
* **Bottom Panel (Win 11 Glass):** Nền đen sẫm bán trong suốt (`rgba(20, 20, 20, 0.7)`), đổ bóng màu mờ (`box-shadow: 0 4px 15px rgba(0,0,0,0.5)`). Chữ màu trắng sáng.

### 8.3. CSS Code Mẫu (Agent cần áp dụng)
```css
:root {
  --bg-color: #F0F8FF;
  --cabinet-bg: #DEB887;
  --cabinet-border: #8B4513;
  --text-primary: #333333;
  --label-bg: rgba(255, 255, 255, 0.8);
  --label-text: #222222;
  --panel-bg: rgba(255, 255, 255, 0.6);
}

[data-theme="dark"] {
  --bg-color: #1A1A2E;
  --cabinet-bg: #3E2723;
  --cabinet-border: #1B0000;
  --text-primary: #E0E0E0;
  --label-bg: rgba(0, 0, 0, 0.6);
  --label-text: #FFD54F;
  --panel-bg: rgba(20, 20, 20, 0.7);
}

/* Áp dụng vào phần tử */
body {
  background-color: var(--bg-color);
  color: var(--text-primary);
  transition: background-color 0.3s ease, color 0.3s ease;
}
/* Agent lưu trạng thái Theme vào localStorage chung với các setting khác */

```

```

