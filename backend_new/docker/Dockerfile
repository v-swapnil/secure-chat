FROM golang:1.21-alpine AS builder
RUN apk add --no-cache git build-base
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o /bin/secure-chat ./cmd/server

FROM alpine:latest
RUN apk add --no-cache ca-certificates
COPY --from=builder /bin/secure-chat /bin/secure-chat
WORKDIR /
EXPOSE 8080
ENTRYPOINT ["/bin/secure-chat"]
