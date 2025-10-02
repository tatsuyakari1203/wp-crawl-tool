# WordPress Crawl Tool

Tool để crawl toàn bộ nội dung posts từ WordPress site và xuất thành file DOCX.

## Tính năng

- ✅ Crawl tất cả posts từ WordPress site sử dụng REST API
- ✅ Xử lý HTML content và chuyển đổi thành format phù hợp
- ✅ Xuất thành file DOCX với format đẹp
- ✅ Hỗ trợ mục lục và trang tóm tắt
- ✅ Nhóm posts theo category hoặc sắp xếp theo ngày
- ✅ CLI interface dễ sử dụng
- ✅ Hiển thị progress và thống kê

## Cài đặt

Đảm bảo bạn đã cài đặt Bun:

```bash
# Cài đặt dependencies
bun install
```

## Sử dụng

### Kiểm tra WordPress site

Trước khi crawl, bạn có thể kiểm tra xem site có hỗ trợ WordPress REST API không:

```bash
bun run index.js check -u https://yoursite.com
```

### Crawl và xuất posts

```bash
# Cơ bản
bun run index.js export -u https://yoursite.com

# Với các tùy chọn
bun run index.js export -u https://yoursite.com -o my-export -d ./exports --group-by-category
```

### Các tùy chọn

#### Command `export`:

- `-u, --url <url>`: URL của WordPress site (bắt buộc)
- `-o, --output <filename>`: Tên file output (mặc định: wordpress-export)
- `-d, --dir <directory>`: Thư mục output (mặc định: ./output)
- `--no-toc`: Không tạo mục lục
- `--no-summary`: Không tạo trang tóm tắt
- `--group-by-category`: Nhóm posts theo category
- `--sort-by-title`: Sắp xếp theo tiêu đề thay vì ngày

#### Command `check`:

- `-u, --url <url>`: URL của WordPress site (bắt buộc)

## Ví dụ

```bash
# Kiểm tra site
bun run index.js check -u myblog.com

# Export cơ bản
bun run index.js export -u myblog.com

# Export với tùy chọn nâng cao
bun run index.js export -u myblog.com -o blog-backup-2024 -d ./backups --group-by-category --no-toc

# Export và sắp xếp theo tiêu đề
bun run index.js export -u myblog.com --sort-by-title
```

## Yêu cầu

- WordPress site phải hỗ trợ REST API (mặc định từ WordPress 4.7+)
- Site phải có thể truy cập công khai hoặc API phải được bật
- Bun runtime

## Cấu trúc file output

File DOCX được tạo sẽ bao gồm:

1. **Trang tiêu đề**: Thông tin tổng quan
2. **Trang tóm tắt**: Thống kê categories, tags, tác giả
3. **Mục lục**: Danh sách tất cả posts
4. **Nội dung posts**: 
   - Tiêu đề post
   - Thông tin meta (ngày, tác giả, category)
   - Nội dung đã được format
   - Separator giữa các posts

## Xử lý nội dung

Tool sẽ tự động:

- Chuyển đổi HTML thành text có format
- Xử lý headings, paragraphs, lists, quotes, code blocks
- Thay thế images bằng placeholder text
- Chuyển đổi links thành text với URL
- Loại bỏ scripts và styles

## Troubleshooting

### Lỗi "WordPress REST API không khả dụng"

- Kiểm tra URL site có đúng không
- Đảm bảo site là WordPress và có bật REST API
- Thử truy cập `https://yoursite.com/wp-json/wp/v2/posts` trực tiếp

### Lỗi kết nối

- Kiểm tra kết nối internet
- Đảm bảo site không bị chặn hoặc yêu cầu authentication
- Thử với HTTP thay vì HTTPS nếu site không hỗ trợ SSL

### File output bị lỗi

- Đảm bảo có quyền ghi vào thư mục output
- Kiểm tra dung lượng ổ đĩa
- Thử với tên file khác

## License

MIT