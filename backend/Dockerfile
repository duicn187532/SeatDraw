# 使用官方 Go 多阶段构建
# 第一阶段：编译二进制
FROM golang:1.24-alpine AS builder

# 安装 git (若需要 go mod private repo)，并创建工作目录
RUN apk add --no-cache git
WORKDIR /app

# 复制 go.mod, go.sum 并下载依赖，加速后续构建
COPY go.mod go.sum ./
RUN go mod download

# 复制其余源码并编译
COPY . .
# 交叉编译静态二进制（去除 cgo）
ENV CGO_ENABLED=0 \
    GOOS=linux \
    GOARCH=amd64
RUN go build -ldflags="-s -w" -o server main.go

# 第二阶段：最小体积运行镜像
FROM alpine:latest

# 时区或 ca-certificates（若调用 https）
RUN apk add --no-cache ca-certificates

WORKDIR /root/
# 从 builder 阶段复制可执行文件
COPY --from=builder /app/server .

# 指定启动命令
ENTRYPOINT ["./server"]
