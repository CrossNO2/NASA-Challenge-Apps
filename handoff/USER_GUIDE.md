# Hướng dẫn sử dụng thư mục `data/` (User Guide)

Tài liệu này giúp cả team hiểu cấu trúc dữ liệu trong thư mục `data/` và cách sử dụng, kiểm tra, hoặc cập nhật dữ liệu một cách an toàn và đồng nhất.

---

## 1. Thư mục `data/` gồm những gì?

Thư mục `data/` là nguồn dữ liệu chuẩn (single source of truth) cho toàn bộ danh sách các điểm hạ cánh trên Mặt Trăng:

- `data/sites.json`: Danh sách 26 bản ghi chuẩn (gồm các sứ mệnh hạ cánh mềm thành công của tàu có người lái, tàu tự hành, một số trường hợp thành công một phần có ghi chú rõ ràng, và 1 điểm tham chiếu cực Nam Mặt Trăng `south-pole-reference`). Các sứ mệnh thất bại/va chạm (như Beresheet) không nằm trong danh sách này.
- `data/dataset.json`: Thông tin phiên bản bộ dữ liệu (`version`, `updated`, `coordinate_convention`) dùng để gắn header cho API và kiểm soát cache.
- `data/cross_check_sources.json`: Tọa độ đối chiếu từ nguồn thứ hai (như LROC QuickMap, NASA Moon Trek, bảng NSSDC) cho từng `id` trong `sites.json`, dùng để kiểm tra sai số vị trí (mục tiêu ≤ 1 km).

---

## 2. Hiểu cấu trúc dữ liệu trong `data/sites.json`

Mỗi phần tử trong `data/sites.json` có đúng 14 trường theo thứ tự chuẩn:

| Trường | Kiểu dữ liệu | Ý nghĩa & Quy ước |
| --- | --- | --- |
| `id` | `string` | Mã định danh viết thường, dạng slug (ví dụ `apollo-11`, `chang-e-4`), duy nhất và ổn định giữa các phiên bản. |
| `name` | `string` | Tên hiển thị của điểm hạ cánh / sứ mệnh. |
| `latitude` | `number` | Vĩ độ selenographic (độ), trong khoảng `[-90, 90]`, dương về phía Bắc (`+` Bắc, `-` Nam). |
| `longitude` | `number` | Kinh độ selenographic (độ), dương về phía Đông, chuẩn hóa trong khoảng `[-180, 180)`. |
| `region` | `string` | Tên vùng hoặc hố va chạm trên Mặt Trăng (ví dụ `Mare Tranquillitatis`, `Apollo basin`). |
| `site_type` | `enum` | `crewed` (có người lái), `robotic` (tự hành), hoặc `reference` (điểm tham chiếu). |
| `status` | `enum` | `landed` (đã hạ cánh) hoặc `reference` (chỉ là điểm tham chiếu, không phải tàu hạ cánh). |
| `country` | `string \| null` | Quốc gia thực hiện sứ mệnh (`null` nếu là `reference`). |
| `operator` | `string \| null` | Cơ quan hoặc đơn vị vận hành (`null` nếu là `reference`). |
| `mission` | `string \| null` | Tên sứ mệnh (`null` nếu là `reference`). |
| `landing_date` | `ISO date \| null` | Ngày hạ cánh theo giờ UTC, định dạng `YYYY-MM-DD` (`null` nếu là `reference`). |
| `source_name` | `string` | Tên nguồn trích dẫn chính của bản ghi. |
| `source_url` | `URL` | Đường dẫn HTTP/HTTPS tới nguồn chính thức. |
| `notes` | `string \| null` | Ghi chú ngắn (ví dụ: tàu bị nghiêng sau khi tiếp đất, hoặc lý do điểm tham chiếu). |

### Quy ước tọa độ cần nhớ
- **Vĩ độ (`latitude`)**: Bắc dương (`+`), Nam âm (`-`).
- **Kinh độ (`longitude`)**: Đông dương (`+`), Tây âm (`-`), luôn nằm trong `[-180, 180)`. Ví dụ `180°` được chuẩn hóa thành `-180°`.
- **Không tự quy đổi hệ tọa độ**: Dữ liệu giữ nguyên giá trị công bố (selenographic). Việc quy đổi khung tham chiếu chi tiết (nếu có) thuộc về adapter địa hình sau này.

---

## 3. Cách sử dụng dữ liệu trong code & API

### Cách 1: Đọc trực tiếp từ Python package
Module `lunar_sites` tự động nạp và kiểm tra hợp lệ `data/sites.json` và `data/dataset.json`:

```python
from lunar_sites import DATASET, SITES

print(DATASET["version"])  # "1.0.0"
print(len(SITES))          # 26
```

### Cách 2: Lấy qua HTTP API
Khởi động server:

```bash
python3 -m lunar_sites.app
```

Các endpoint chính:
- `GET /sites` — Trả về mảng JSON các bản ghi chuẩn.
- `GET /sites/export.json` — Tải file JSON (`lunar-sites.json`) kèm header `X-Dataset-Version`, `X-Dataset-Updated`, `X-Record-Count`, `X-Generated-At`.
- `GET /sites/export.csv` — Tải file CSV chuẩn RFC 4180 (`lunar-sites.csv`), giá trị `null` được xuất thành ô trống.
- `GET /dataset` — Trả về metadata phiên bản và `record_count`.
- `POST /coordinates/process` — Kiểm tra và chuẩn hóa tọa độ người dùng nhập (trả về kinh độ đã chuẩn hóa, bán cầu, và phân loại `near side` / `far side` / `limb`).

---

## 4. Kiểm tra và cập nhật dữ liệu (CLI)

Khi thêm mới hoặc chỉnh sửa dữ liệu, luôn chạy CLI để đảm bảo không lỗi schema và không lệch quá 1 km so với nguồn đối chiếu:

```bash
# Kiểm tra schema, kiểu dữ liệu, URL, ngày tháng và định dạng JSON/CSV
python3 -m lunar_sites.cli validate

# Đối chiếu tọa độ trong sites.json với cross_check_sources.json (ngưỡng mặc định 1.0 km)
python3 -m lunar_sites.cli cross-check
```

Nếu có file dữ liệu nháp (staging) cần chuẩn hóa và ghi đè vào `data/sites.json`:

```bash
python3 -m lunar_sites.cli freeze --input path/to/staging.json --version 1.1.0 --updated 2026-11-15
```

---

## 5. Lưu ý quan trọng cho team

1. **Không sửa tay `data/sites.json` mà bỏ qua `validate`**: Mọi sai sót (thiếu trường, kinh độ `>= 180`, URL sai định dạng, trùng `id`) sẽ làm `lunar_sites` báo lỗi ngay khi import.
2. **Không dùng dữ liệu này để thay thế địa hình hay lịch thiên văn**: `data/` chỉ cung cấp danh mục vị trí hạ cánh đã xác thực. Dữ liệu độ cao/chân trời (LOLA/QuickMap) và vị trí Mặt Trời/Trái Đất (JPL Horizons) cần đi qua các adapter riêng trong `lunar_sites/adapters.py`.
3. **Chạy test sau khi sửa dữ liệu**:
   ```bash
   python3 -m unittest discover -s tests -v
   ```
