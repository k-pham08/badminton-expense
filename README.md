# Cầu Lông — chia tiền team

App React Native (iOS) để chọn ngày đánh trong tháng, nhập tiền sân / cầu, rồi chia theo số người — ai đánh ít giờ hơn thì trả ít hơn.

## Dùng thế nào

1. **Thành viên**: nhập tên rồi lưu. Dùng lại cho mọi buổi.
2. **Sân**: lưu chi nhánh, tên sân, và **giờ cố định** (bắt đầu/kết thúc, bước 5 phút). Buổi đánh chỉ chọn sân, không nhập giờ lại.
3. **Tháng mới**: nhập **tên cầu** và **giá 1 trái**. Chọn **thứ đánh** (T3, T6…) một lần — áp dụng cả tháng.
4. Muốn đổi sân/người một hôm thì vào đúng ngày đó. Có thể **Áp dụng cho mọi thứ …** để copy sang các ngày cùng thứ.
5. Sau khi đánh, mở buổi đó:
   - Sân: chọn chi nhánh + sân + khung giờ đã lưu. Số giờ tự tính.
   - Số trái cầu tháng (theo tên/giá đã đặt)
   - Loại cầu phát sinh: tên cầu, giá/trái, số trái
   - Chọn thành viên đã lưu, hoặc thêm người mới vào buổi (sẽ được lưu lại)
   - Ai đến trễ / về sớm: bớt **giờ đánh** của người đó. Tiền sân + cầu chia theo giờ.
6. Mặc định chia đều (mọi người đủ giờ). Có người ít giờ hơn thì tiền từng người khác nhau. Số mỗi người **làm tròn 1.000đ**. Đánh dấu **Đã chuyển / Chưa chuyển**.
7. Tab **Tổng kết**: cộng nợ từng người, còn bao nhiêu, đánh dấu đã chuyển cả tháng.

Dữ liệu lưu trên máy, không cần tài khoản.

**Chuyển máy:** tab Tháng → **Sao lưu**.

- Dữ liệu nhỏ: **Xuất JSON** (copy / AirDrop chữ). Máy kia **Nhập JSON** → Dán JSON.
- Dữ liệu lớn (>50KB): xuất/nhập bằng file `.json`.

Nhập sẽ thay toàn bộ dữ liệu trên máy nhận.

## Chạy trên iOS

Cần Node 20+ (khuyên dùng 24).

### Máy thật, không cần ký Apple (Expo Go)

SDK 57 trên iPhone: phải đăng nhập **cùng một tài khoản Expo** (miễn phí) ở máy Mac và trong Expo Go. Đây không phải tài khoản Apple Developer.

1. Tạo tài khoản miễn phí: https://expo.dev/signup
2. Cài [Expo Go](https://apps.apple.com/app/expo-go/id982107779) từ App Store.
3. Trên Mac:

```bash
cd chia-tien-cau-long
nvm use 24
npx expo login
npm start
```

4. Trong Expo Go: tab Home → icon avatar góc phải → đăng nhập **cùng tài khoản**.
5. Mac và iPhone cùng Wi‑Fi, quét QR.
6. Nếu không vào được, chạy `npx expo start --tunnel`.

App chạy trong Expo Go. Tắt Metro (`Ctrl+C`) thì mở lại phải `npm start` rồi vào lại.

Không làm được: icon riêng trên Home Screen như app cài hẳn, đưa cho người khác cài file `.ipa`. Muốn vậy vẫn phải ký với Apple (tài khoản dev, 7 ngày nếu dùng Apple ID miễn phí).

### App độc lập trên máy thật (không cần `npm start`)

JS được đóng vào app. Cài xong mở icon **Cầu Lông** như app thường.

iOS **bắt buộc ký**. Không có cách cài app độc lập mà bỏ hẳn bước này.

**Cách rẻ nhất (Apple ID miễn phí, ~7 ngày rồi build lại):**

1. Cắm iPhone vào Mac, tin tưởng máy, bật **Developer Mode** (Cài đặt → Quyền riêng tư).
2. Xcode → Settings → Accounts → thêm Apple ID (không cần trả $99).
3. Lần đầu mở Xcode, chọn team Personal cho app nếu được hỏi.

```bash
cd chia-tien-cau-long
nvm use 24
npm run ios:install
```

Lệnh này build Release, cài lên iPhone, **không gắn debugger**. Tắt Xcode app vẫn chạy. Mở từ icon **Cầu Lông** trên Home Screen.

Nếu bấm ▶ trong Xcode (hoặc `npm run ios:device`) thì Xcode giữ debugger — tắt Xcode là app bị kill. Đừng mở app từ nút ▶ nếu muốn dùng độc lập.

Hết hạn ~7 ngày: cắm máy, chạy lại `npm run ios:device`.

**Muốn bền (TestFlight, không phải build lại 7 ngày):** Apple Developer Program **$99/năm**, rồi `eas build --platform ios` / TestFlight.
