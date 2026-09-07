# Vàng Nhật Anh – Dữ liệu & ảnh

Repo này là "cơ sở dữ liệu" cho website [vangnhatanh](https://github.com/duybui2203/vangnhatanh).
Trang quản trị của website ghi trực tiếp vào đây qua GitHub API. **Repo phải để Public** để website đọc được.

```
data/
  settings.json            tên công ty, slogan, địa chỉ, SĐT, Zalo, giờ mở cửa, cam kết, giá Vàng Nhật Anh
  categories.json          danh mục (thứ tự = thứ tự hiển thị)
  products/<id>.json       sản phẩm của từng danh mục
  prices/latest.json       giá vàng thị trường mới nhất (bot tự cập nhật)
  prices/history/<ngày>.json  giá cuối ngày, dùng cho cột "Hôm qua"
images/
  categories/<id>/banner.*  ảnh lớn trên pageview
  categories/<id>/icon.*    icon ở dải danh mục
  products/<id>/<mã>.*      ảnh sản phẩm
scripts/fetch-prices.mjs   script lấy giá vàng
.github/workflows/gold-prices.yml   lịch chạy mỗi 15 phút
```

## Bot giá vàng

- Nguồn: PNJ (dòng SJC), DOJI, Bảo Tín Minh Châu, Phú Quý, Bảo Tín Mạnh Hải. Đơn vị: **nghìn đồng/lượng**.
- Chạy tự động mỗi 15 phút (GitHub có thể trễ vài phút). Chỉ commit khi giá đổi.
- Chạy tay: tab **Actions → Cập nhật giá vàng → Run workflow**.
- Lần đầu cần bật: **Settings → Actions → General → Workflow permissions → Read and write permissions**.
- Lưu ý: GitHub tự tắt lịch chạy nếu repo không có commit nào trong 60 ngày; vào Actions bấm *Enable* lại là xong.
- Nếu một nguồn lỗi, dòng đó giữ giá cũ và được đánh dấu `stale` (web hiển thị mờ + giờ cập nhật).

## Định dạng

`categories.json`
```json
{ "id": "nhan-cuoi", "name": "Nhẫn cưới", "subtitle": "Sản phẩm bán chạy", "badge": "Bán chạy",
  "banner": "images/categories/nhan-cuoi/banner.webp", "icon": "images/categories/nhan-cuoi/icon.webp", "visible": true }
```

`products/<id>.json`
```json
{ "id": "nc-001", "name": "Cặp nhẫn cưới trơn 24K", "price": 28600000, "image": "images/products/nhan-cuoi/nc-001.webp",
  "gold": "Vàng 24K (9999)", "weight": "2 chỉ / cặp", "desc": "...", "badge": "Bán chạy", "visible": true }
```
`price` = `null` → web hiển thị **"Liên hệ"**.
