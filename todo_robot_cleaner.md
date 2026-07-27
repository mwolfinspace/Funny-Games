Dưới đây là bản mô tả chi tiết (Blueprint/Game Design Document) được sắp xếp logic, tối ưu hoá cấu trúc và bổ sung các gợi ý kỹ thuật. Bạn có thể copy toàn bộ file Markdown này gửi cho AI Agent để nó viết code một cách trơn tru, hạn chế tối đa bug về logic và layout.

---

# GAME DESIGN DOCUMENT: ROBOT CLEANER (HTML5)

## 1. Cấu trúc thư mục và Tài nguyên (Assets)

* **File chính:** `robot_cleaner.html` (chứa toàn bộ HTML, CSS, JS hoặc chia file tuỳ ý agent, nhưng output cuối phải chạy được ngay).
* **Thư mục ảnh:** `./robots/`
* Chứa các file: `robot1.png`, `robot2.png`, `robot3.png`, `robot4.png`, `robot5.png`.
* **Đặc điểm:** Định dạng PNG, nền trong suốt, kích thước `1000x1000 px`. Đầu/mặt robot mặc định hướng lên trên (góc 0 độ / 12 giờ).



## 2. Kiến trúc Giao diện (UI/UX Layout)

Sử dụng CSS Flexbox/Grid và `position: absolute` để overlay UI lên trên Game Zone. Các thao tác touch cần chặn hành vi mặc định của trình duyệt. Phong cách nút bấm hiện đại, trong mờ như windows 11.

### 2.1. Global Settings (CSS khuyên dùng)

* Thêm `user-select: none; -webkit-user-select: none;` để tránh bôi đen text.
* Thêm `touch-action: none;` vào container game để vô hiệu hoá double-tap to zoom, pull-to-refresh trên mobile.
* Chặn menu chuột phải bằng JS: `document.addEventListener('contextmenu', event => event.preventDefault());`

### 2.2. Game Zone (Canvas / Lớp dưới cùng)

* Chiếm `100vw` và `100vh`.
* Nền (Background): Màu trắng (`#FFFFFF`).
* Khối nhà (Buildings/Obstacles): Các hình vuông/chữ nhật màu pastel nhẹ nhàng (ví dụ: xanh lá mạ nhẹ, xám nhạt).
* Đường đi (Roads): Màu trắng hoặc xám rất nhạt, đủ tương phản với khối nhà.
* **Tương tác:** Hỗ trợ kéo thả để pan (di chuyển) bản đồ, cuộn chuột/pinch để zoom. Tự động tính toán offset bounding box để bản đồ không bị lấp dưới Top Control hoặc Status Bar.

### 2.3. Top Right Control Zone (Lớp trên)

* **Vị trí:** Góc trên bên phải, cách lề một khoảng an toàn (padding).
* **Bố cục:** Một hàng ngang duy nhất (`display: flex; flex-direction: row-reverse; gap: 10px;`).
* **Thành phần (Dùng SVG/Emoji):**
* 🏠 Nút Home (về `index.html`).
* 🤖 Đổi Skin Robot (vòng lặp từ 1 đến 5).
* ⚡ Chỉnh tốc độ (x1, x1.5, x2).
* 📈 Level (tăng giảm độ khó/độ rộng map).
* 🎲 Random Map (tạo map mới hoàn toàn).
* 🎨 Random Colors (đổi màu khối nhà).
* 📍 Random Vị trí (đổi vị trí Start/End, giữ nguyên map).
* 🔍 Auto-zoom Toggle (Bật/tắt tự động fit màn hình).
* 🎥 Camera Mode (Toggle giữa **Lock Map** và **Lock Robot**).



### 2.4. Control Panel & Status Bar (Lớp trên, Cạnh dưới)

* **Lịch sử lệnh (Command Queue):** Nằm ngay trên các nút điều hướng. Hiển thị dạng danh sách hàng ngang các icon mũi tên đã chọn. Cập nhật realtime. Có thể click vào một lệnh để xoá (các lệnh sau tự dồn lên lấp chỗ trống).
* **Nút Điều hướng (Dành cho Stage 2):** 3 nút to, nổi, hình tròn. Nằm giữa màn hình, ngay trên thanh status.
* [ ↩️ Rẽ Trái ] - [ ⬆️ Đi Thẳng ] - [ ↪️ Rẽ Phải ]
* *Nút "Run" (▶️) (Chỉ hiện trong chế độ Programmed Control).*


* **Thanh Status (Dưới cùng):** Chiếm chiều ngang 100%, background bán trong suốt. Hiển thị: Stage hiện tại, Level, Số bước lệnh hiện tại / Tổng số lệnh tối ưu, Timer (nếu đang chạy).

---

## 3. Game Flow & Logic (3 Stages)

### Stage 1: Tạo bản đồ & Thiết lập

* **Logic tạo Map (Maze/Grid Generation):**
* Bản đồ cấu tạo từ một Grid 2D (ví dụ mảng 2 chiều 0 là nhà, 1 là đường). Kích thước đường đi cố định bằng với scale của robot.
* Đảm bảo có ngã 3, ngã 4 và các góc chữ L.
* **Quy tắc Level:** Level $n$ yêu cầu số lệnh điều hướng tối thiểu để đến đích là $n + 2$ lệnh. (Ví dụ: Lvl 1 cần đúng 3 lệnh, Lvl 2 cần 4 lệnh). Agent cần chạy thuật toán tìm đường ngắn nhất (BFS/A*) ngầm định để xác minh map sinh ra có thoả mãn điều kiện Level không. Đặt Robot ở rìa bản đồ.


* **Hiển thị:** Vẽ bản đồ, đặt Robot tại điểm Start (xoay đúng hướng đường đi), đặt ngôi sao ⭐ tại điểm End.
* Người chơi bấm "Bắt đầu" để chuyển sang Stage 2.

### Stage 2: Di chuyển Robot

Người chơi chọn 1 trong 2 chế độ:

#### Chế độ 1: Live Control (Điều khiển trực tiếp)

* Robot bắt đầu ở trạng thái đứng yên. Chờ lệnh từ 3 nút điều hướng.
* **Logic Lệnh:**
* **Đi thẳng (Forward):** Robot di chuyển về phía trước (theo hướng mặt hiện tại) cho đến khi gặp ngã 3, ngã 4, điểm đích, hoặc **góc chữ L**. Sau đó dừng lại chờ lệnh tiếp.
* **Rẽ trái (Turn Left):** Robot xoay tại chỗ -90 độ, sau đó tự động **Đi thẳng** đến ngã rẽ tiếp theo/đích.
* **Rẽ phải (Turn Right):** Robot xoay tại chỗ +90 độ, sau đó tự động **Đi thẳng** đến ngã rẽ tiếp theo/đích.


* *Lưu ý góc chữ L:* Khi đến góc chết (chỉ có 1 hướng rẽ), robot PHẢI dừng lại. Người chơi bắt buộc phải bấm lệnh Rẽ Trái hoặc Rẽ Phải thì robot mới đi tiếp. Điều này ép người chơi tư duy về hướng.
* Mỗi lần bấm nút, icon lệnh được push vào thanh "Lịch sử lệnh".

#### Chế độ 2: Programmed Control (Lập trình trước)

* Khác với Live Control, robot không chạy ngay.
* Người chơi bấm các nút điều hướng để tạo ra một mảng lệnh (`commandArray`). Lệnh hiện lên UI.
* Người chơi có thể click vào icon lệnh bất kỳ trên UI để xoá `commandArray.splice(index, 1)`.
* Khi bấm nút **▶️ Run**, hệ thống duyệt `commandArray`:
* Lệnh nào đang chạy sẽ highlight sáng lên.
* Nếu đang chạy mà hoàn toàn che lấp ngôi sao ⭐ -> Dừng lại ngay lập tức -> Thắng (kể cả phía sau còn lệnh thừa).
* Nếu hết lệnh mà chưa tới đích, hoặc đâm vào tường (bấm sai hướng) -> Dừng lại, báo lỗi, cho phép sửa lệnh chạy lại.
* Nút Run chuyển thành nút reset sau khi bấm Run để có thể dừng ngay và đặt lại vị trí robot về ban đầu, người chơi sửa lệnh rồi bấm run lại.



#### Camera System (Cốt lõi của trò chơi)

* **Lock on Map:** Bản đồ đứng yên. Canvas chỉ vẽ robot thay đổi tọa độ $(x, y)$ và góc xoay (`rotation`).
* **Lock on Robot:** Bản đồ xoay quanh robot.
* Mũi tên/mặt robot **luôn luôn** hướng thẳng đứng lên trên (0 độ) ở giữa màn hình.
* Khi rẽ trái, bản đồ sẽ quay +90 độ (thuận chiều kim đồng hồ) quanh vị trí robot.



### Stage 3: Kết thúc & Tổng kết

* **Điều kiện thắng:** Tọa độ tâm của Robot trùng khớp (che lấp hoàn toàn) tọa độ tâm của ngôi sao ⭐. Tránh việc chỉ vừa chạm viền (bounding box giao nhau) đã tính là thắng.
* **UI Kết thúc (Popup Modal):**
* Thông báo chúc mừng.
* Thời gian hoàn thành.
* Lịch sử các lệnh người chơi đã dùng.
* **Đáp án tối ưu (Thuật toán):** Hiển thị chuỗi lệnh ngắn nhất để người chơi so sánh.
* Nút "Chơi Lại" (Replay map hiện tại) hoặc "Map Mới" (Tăng level/Tạo map ngẫu nhiên).



---

## 4. Gợi ý Kỹ thuật cho AI Agent (Hints for prompt execution)

Để code mượt mà, AI hãy tuân thủ các pattern sau:

**1. State Management:**
Sử dụng một object quản lý trạng thái Game:

```javascript
const GameState = {
    stage: 1, // 1: Setup, 2: Playing, 3: End
    mode: 'LIVE', // 'LIVE' hoặc 'PROGRAM'
    camera: 'LOCK_MAP', // 'LOCK_MAP' hoặc 'LOCK_ROBOT'
    level: 1,
    tileSize: 100, // Kích thước 1 ô vuông đường đi tương đương size robot
    robot: { x: 0, y: 0, angle: 0 }, // angle tính bằng độ (0, 90, 180, 270)
    commandQueue: [],
    isMoving: false
};

```

**2. Grid & Path Logic:**
Bản đồ nên là ma trận 2D: `0` = Tường/Nhà, `1` = Đường.
Khi robot "Đi thẳng", hãy dùng vòng lặp `while` hoặc `requestAnimationFrame` kiểm tra ô tiếp theo theo hướng angle hiện tại. Dừng di chuyển nếu ô tiếp theo không phải `1` HOẶC phát hiện 2 bên trái/phải có đường rẽ (ngã 3, ngã 4).

**3. Công thức Camera Lock on Robot (Canvas Rendering):**
Để giữ Robot luôn hướng lên trên và ở giữa màn hình, áp dụng phép biến đổi không gian cho Canvas Context:

```javascript
ctx.save();
// Đưa gốc toạ độ ra giữa màn hình
ctx.translate(canvas.width / 2, canvas.height / 2);
// Xoay bản đồ ngược lại với hướng của robot (để robot luôn hướng lên)
ctx.rotate(-robot.angle * Math.PI / 180);
// Di chuyển bản đồ ngược lại vị trí của robot
ctx.translate(-robot.x, -robot.y);

// ... (Vẽ ma trận bản đồ ở đây) ...
// ... (Vẽ robot ở toạ độ robot.x, robot.y nhưng không xoay nó nữa vì bản đồ đã xoay) ...

ctx.restore();

```

**4. Smooth Movement:**
Không nên "dịch chuyển tức thời" robot từ node này sang node khác. Hãy dùng hàm nội suy (Lerp) hoặc tweening cơ bản trong `requestAnimationFrame` để tạo hiệu ứng robot lướt đi và xoay từ từ (animation 90 độ mượt mà) trước khi đi thẳng. Điều này đặc biệt quan trọng để UX tốt.

**5. Assets Loading:**
Tạo hàm `preloadImages()` để load `robot1.png` đến `robot5.png`. Chỉ khởi tạo `Game Loop` khi toàn bộ ảnh đã loaded `onload = true` để tránh lỗi vẽ Canvas bị đen nghiệm trọng. Mặc định load `robot1.png` khi mới vào.

**6. Tối ưu Tỉ lệ Bản đồ (Aspect Ratio Optimization)**
Ưu tiên màn hình ngang (Landscape Focus): Thuật toán sinh bản đồ (Maze/Grid Generation) cần dựa vào kích thước viewport hiện tại để quyết định số lượng ô (grid cells). Bản đồ tạo ra phải ưu tiên bám sát tỉ lệ 16:9 hoặc 16:10 của các màn hình Desktop/Web tiêu chuẩn.

Responsive Grid Logic: Hạn chế tối đa việc tạo map dọc (portrait) theo mặc định. Hệ thống chỉ nên sinh map dọc khi phát hiện thiết bị của người chơi thực sự đang ở chế độ dọc (Mobile Portrait - window.innerHeight > window.innerWidth).

Gợi ý code cho Agent:
Khi khởi tạo số cột (columns) và hàng (rows) cho ma trận bản đồ, hãy tính toán dựa trên aspect ratio:

JavaScript
// Lấy tỉ lệ màn hình hiện tại
const aspectRatio = window.innerWidth / window.innerHeight;

// Base size thay đổi theo Level (ví dụ Level 1 bắt đầu với 8 hàng)
let rows = 8 + (GameState.level * 2); 

// Cột sẽ tự động scale theo màn hình (ưu tiên chiều ngang)
// Nếu màn hình ngang, số cột sẽ nhiều hơn số hàng.
let cols = Math.floor(rows * (aspectRatio >= 1 ? aspectRatio : 1));

// Nếu là thiết bị di động dọc, có thể đảo lại logic hoặc giữ nguyên để map tự fit.
if (aspectRatio < 1) {
    cols = 8 + (GameState.level * 2);
    rows = Math.floor(cols / aspectRatio);
}

**7. Độ dài đoạn đường (Path Length):**

Khoảng cách tối thiểu giữa hai ngã rẽ (ngã 3, ngã 4 hoặc góc chữ L) phải từ 3 đến 5 ô (tiles).Không đặt các ngã rẽ sát cạnh nhau khiến bản đồ bị vụn và nhỏ.Đường đi cần có những đoạn thẳng dài để tạo cảm giác Robot đang thực sự "di chuyển".Độ khó theo Level: * Level $n$ yêu cầu ít nhất $n+2$ quyết định rẽ hướng chính xác để về đích.Robot luôn xuất phát ở rìa ngoài của bản đồ. Đích đến ⭐ nằm sâu bên trong hoặc ở phía đối diện.

**8. Lưu lại setting vào localstorage và seedid:**

Lưu lại các cài đặt, màu sắc toà nhà v.v... bản đồ đang chơi vào localstorage.
Đồng thời lưu lại bản đồ, vị trí bắt đầu, đích dạng seedid với các ký tự như !@#$.... case sensitive Aa càng ngắn càng tốt, đôi khi chỉ cần lưu đường đi, dạng sơ đồ cây, độ dài, và các hình vuông tự tạo lấp đầy hai bên đường là sẽ tối ưu được seedid ngắn nhất có thể. Seedid sẽ hiện ở status bar, click vào sẽ tự copy vào clipboard.
Một khung để nhập seedid vào ở top control, mặc định sẽ hiện seedid hiện tại, người chơi thay đổi, dán vào là map tự update theo. Map không thay đổi seedid khi robot thay đổi vị trí. seedid sẽ không thay đổi khi chơi, chỉ thay đổi khi đổi map. Có thể gọi là mapID thay vì seedid.