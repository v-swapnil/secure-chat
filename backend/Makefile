.PHONY: build run test clean docker-build docker-run migrate-up migrate-down

# Build the application
build:
	go build -o bin/server cmd/server/main.go

# Run the application
run:
	go run cmd/server/main.go

# Run tests
test:
	go test -v ./...

# Clean build artifacts
clean:
	rm -rf bin/

# Build Docker image
docker-build:
	docker build -t secure-chat-backend .

# Run Docker container
docker-run:
	docker run -p 8080:8080 --env-file .env secure-chat-backend

# Database migrations
migrate-up:
	@echo "Running migrations..."
	@go run cmd/server/main.go migrate up

migrate-down:
	@echo "Rolling back migrations..."
	@go run cmd/server/main.go migrate down

# Install dependencies
deps:
	go mod download
	go mod tidy

# Run with hot reload (requires air)
dev:
	air

# Format code
fmt:
	go fmt ./...

# Lint code
lint:
	golangci-lint run
