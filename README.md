# skybull


Platform chatbot tích hợp với LLM (Ollama). Xử dụng 100% Ollama model không có API ngoài.

## Tổng quan

- Kiến trúc: Express + TypeScript.
- Endpoints chính:
	- `POST /api/chat` — gửi `{"question": "..."}` để nhận câu trả lời từ LLM.
	- `GET /api/game/views` — xem lượt xem cho người dùng có role `developer`.

## Files chính

- `app.ts` — khởi tạo server, middleware demo (fake auth), route mount.
- `routes/chat.ts` — logic xử lý chat, prompt composition, session memory, sanitization và rate limiting.
- `services/llm.service.ts` — tích hợp Ollama, wrapper `callLLM` và helper stream.
- `services/data.service.ts` — nơi lưu/truy xuất dữ liệu nền tảng (user profile, views, v.v.).
- `lib/security/rateLimiter.ts` — cơ chế giới hạn tần suất (rate limiting).

## Yêu cầu & Cài đặt

- Node.js >= 16 (khuyến nghị Node 18+)
- Cài đặt:

```bash
npm install
```

- Chạy phát triển (sử dụng `ts-node-dev`):

```bash
npm start
# server chạy mặc định ở http://localhost:3000
```

## Biến môi trường quan trọng

- `OLLAMA_URL` — URL đến Ollama (mặc định `http://localhost:11434`).
- `OLLAMA_MODEL` — tên model (mặc định `mistral:latest`).
- `DEBUG` — `true` để bật thông tin debug chi tiết.

## Cách dùng nhanh (ví dụ)

- Gửi câu hỏi tới LLM:

```bash
curl -X POST http://localhost:3000/api/chat \
	-H "Content-Type: application/json" \
	-d '{"question":"How do I fix frame drops in my Unity game?"}'
```

- Lấy lượt xem (developer):

```bash
curl http://localhost:3000/api/game/views
```



- Có một middleware `fake auth` trong `app.ts` — để test xem chatbot có phản hồi với thông tin của user trong database ko
- `routes/chat.ts` đã có các bước phòng tránh prompt injection và giới hạn độ dài câu hỏi, nhưng cần kiểm tra kỹ khi thay đổi prompt.
- `services/llm.service.ts` xử lý fallback khi model không tìm thấy và báo lỗi có thông tin khi `DEBUG=true`.

