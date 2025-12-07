.PHONY: help build run test clean fmt lint install-deps generate-keys

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

install-deps: ## Install Go dependencies
	go mod download
	go mod tidy

build: ## Build the server binary
	go build -o bin/server cmd/server/main.go

run: ## Run the server in development mode
	go run cmd/server/main.go

test: ## Run tests
	go test -v ./...

test-coverage: ## Run tests with coverage
	go test -v -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

fmt: ## Format code
	go fmt ./...

lint: ## Run linter
	golangci-lint run || go vet ./...

clean: ## Clean build artifacts
	rm -rf bin/
	rm -f coverage.out coverage.html

generate-keys: ## Generate RSA key pair for envelope encryption
	@echo "Generating RSA key pair..."
	mkdir -p secrets
	openssl genrsa -out secrets/server_rsa_priv.pem 4096
	openssl rsa -in secrets/server_rsa_priv.pem -pubout -out secrets/server_rsa_pub.pem
	@echo "Keys generated in ./secrets/"
	@echo "Public key: secrets/server_rsa_pub.pem"
	@echo "Private key: secrets/server_rsa_priv.pem"

docker-build: ## Build Docker image
	docker build -t securechat-backend .

docker-run: ## Run Docker container
	docker run -p 8080:8080 --env-file .env securechat-backend

db-migrate: ## Run database migrations (via server startup)
	@echo "Migrations run automatically on server start"

dev: ## Run with live reload (requires air: go install github.com/cosmtrek/air@latest)
	air
