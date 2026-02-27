# XASE Sheets - Makefile Principal
# Versão: 3.0.0

.PHONY: help setup install test dev build clean

# Colors
GREEN  := \033[0;32m
YELLOW := \033[1;33m
RED    := \033[0;31m
NC     := \033[0m

# Default target
.DEFAULT_GOAL := help

## help: Show this help message
help:
	@echo "$(GREEN)XASE Sheets - Available Commands$(NC)"
	@echo ""
	@echo "$(YELLOW)Setup:$(NC)"
	@echo "  make setup              - Complete setup (install + db)"
	@echo "  make install            - Install dependencies"
	@echo "  make db-setup           - Setup database"
	@echo ""
	@echo "$(YELLOW)Development:$(NC)"
	@echo "  make dev                - Start dev server"
	@echo "  make build              - Build for production"
	@echo "  make start              - Start production server"
	@echo "  make clean              - Clean build artifacts"
	@echo ""
	@echo "$(YELLOW)Testing:$(NC)"
	@echo "  make test               - Run all tests"
	@echo "  make test-unit          - Run unit tests"
	@echo "  make test-e2e           - Run E2E tests"
	@echo "  make test-deidentify    - Test de-identification"
	@echo ""
	@echo "$(YELLOW)Database:$(NC)"
	@echo "  make db-migrate         - Run migrations"
	@echo "  make db-seed            - Seed database"
	@echo "  make db-reset           - Reset database"
	@echo ""
	@echo "$(YELLOW)Linting:$(NC)"
	@echo "  make lint               - Run linter"
	@echo "  make format             - Format code"
	@echo "  make type-check         - Type checking"
	@echo ""
	@echo "$(YELLOW)Docker:$(NC)"
	@echo "  make docker-build       - Build Docker image"
	@echo "  make docker-run         - Run Docker container"
	@echo "  make docker-compose     - Start with docker-compose"
	@echo ""
	@echo "$(YELLOW)Components:$(NC)"
	@echo "  make deidentify         - Work with de-identification"
	@echo "  make sidecar            - Work with Rust sidecar"
	@echo "  make cli                - Work with CLI tool"
	@echo ""
	@echo "$(YELLOW)Documentation:$(NC)"
	@echo "  make docs               - View documentation"
	@echo "  make status             - Project status"
	@echo ""

## setup: Complete setup
setup: install db-setup
	@echo "$(GREEN)✓ Setup complete!$(NC)"
	@echo "Run 'make dev' to start development server"

## install: Install dependencies
install:
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	npm install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

## db-setup: Setup database
db-setup:
	@echo "$(YELLOW)Setting up database...$(NC)"
	npm run db:migrate
	npm run db:seed
	@echo "$(GREEN)✓ Database ready$(NC)"

## dev: Start dev server
dev:
	@echo "$(YELLOW)Starting development server...$(NC)"
	npm run dev

## build: Build for production
build:
	@echo "$(YELLOW)Building for production...$(NC)"
	npm run build
	@echo "$(GREEN)✓ Build complete$(NC)"

## start: Start production server
start:
	@echo "$(YELLOW)Starting production server...$(NC)"
	npm run start

## clean: Clean build artifacts
clean:
	@echo "$(YELLOW)Cleaning...$(NC)"
	rm -rf .next/
	rm -rf dist/
	rm -rf node_modules/
	rm -rf .turbo/
	@echo "$(GREEN)✓ Cleaned$(NC)"

## test: Run all tests
test:
	@echo "$(YELLOW)Running all tests...$(NC)"
	npm run test
	@echo "$(GREEN)✓ Tests complete$(NC)"

## test-unit: Run unit tests
test-unit:
	@echo "$(YELLOW)Running unit tests...$(NC)"
	npm run test:unit
	@echo "$(GREEN)✓ Unit tests complete$(NC)"

## test-e2e: Run E2E tests
test-e2e:
	@echo "$(YELLOW)Running E2E tests...$(NC)"
	npm run test:e2e
	@echo "$(GREEN)✓ E2E tests complete$(NC)"

## test-deidentify: Test de-identification
test-deidentify:
	@echo "$(YELLOW)Testing de-identification...$(NC)"
	cd tests/de-identification && make test-e2e
	@echo "$(GREEN)✓ De-identification tests complete$(NC)"

## db-migrate: Run migrations
db-migrate:
	@echo "$(YELLOW)Running migrations...$(NC)"
	npm run db:migrate
	@echo "$(GREEN)✓ Migrations complete$(NC)"

## db-seed: Seed database
db-seed:
	@echo "$(YELLOW)Seeding database...$(NC)"
	npm run db:seed
	@echo "$(GREEN)✓ Database seeded$(NC)"

## db-reset: Reset database
db-reset:
	@echo "$(YELLOW)Resetting database...$(NC)"
	npm run db:reset
	@echo "$(GREEN)✓ Database reset$(NC)"

## lint: Run linter
lint:
	@echo "$(YELLOW)Running linter...$(NC)"
	npm run lint
	@echo "$(GREEN)✓ Linting complete$(NC)"

## format: Format code
format:
	@echo "$(YELLOW)Formatting code...$(NC)"
	npm run format
	@echo "$(GREEN)✓ Code formatted$(NC)"

## type-check: Type checking
type-check:
	@echo "$(YELLOW)Type checking...$(NC)"
	npm run type-check
	@echo "$(GREEN)✓ Type checking complete$(NC)"

## docker-build: Build Docker image
docker-build:
	@echo "$(YELLOW)Building Docker image...$(NC)"
	docker build -t xase/sheets:3.0.0 .
	docker tag xase/sheets:3.0.0 xase/sheets:latest
	@echo "$(GREEN)✓ Docker image built$(NC)"

## docker-run: Run Docker container
docker-run:
	@echo "$(YELLOW)Running Docker container...$(NC)"
	docker run -p 3000:3000 \
		-v $(PWD)/.env:/app/.env \
		xase/sheets:3.0.0

## docker-compose: Start with docker-compose
docker-compose:
	@echo "$(YELLOW)Starting with docker-compose...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)✓ Services started$(NC)"

## deidentify: Work with de-identification
deidentify:
	@echo "$(YELLOW)Opening de-identification component...$(NC)"
	cd tests/de-identification && make help

## sidecar: Work with Rust sidecar
sidecar:
	@echo "$(YELLOW)Opening Rust sidecar...$(NC)"
	cd sidecar && cargo build

## cli: Work with CLI tool
cli:
	@echo "$(YELLOW)Opening CLI tool...$(NC)"
	cd packages/xase-cli && npm run build

## docs: View documentation
docs:
	@echo "$(GREEN)XASE Sheets Documentation$(NC)"
	@echo ""
	@echo "Main documentation:"
	@echo "  - README.md"
	@echo "  - PROJECT_INDEX.md"
	@echo "  - PROJECT_STATUS.md"
	@echo "  - WORK_COMPLETE.md"
	@echo ""
	@echo "Components:"
	@echo "  - tests/de-identification/README.md"
	@echo "  - sidecar/README.md"
	@echo "  - packages/xase-cli/README.md"
	@echo ""
	@echo "Run 'cat README.md' to view main documentation"

## status: Project status
status:
	@echo "$(GREEN)XASE Sheets Project Status$(NC)"
	@echo ""
	@echo "$(YELLOW)Version:$(NC) 3.0.0"
	@echo "$(YELLOW)Status:$(NC) Production Ready"
	@echo ""
	@echo "$(YELLOW)Components:$(NC)"
	@test -d app && echo "  ✓ Frontend (Next.js)" || echo "  ✗ Frontend"
	@test -d app/api && echo "  ✓ Backend API" || echo "  ✗ Backend API"
	@test -d tests/de-identification && echo "  ✓ De-identification" || echo "  ✗ De-identification"
	@test -d lib/billing && echo "  ✓ Billing System" || echo "  ✗ Billing System"
	@test -d lib/governance && echo "  ✓ Clinical Governance" || echo "  ✗ Clinical Governance"
	@test -d sidecar && echo "  ✓ Rust Sidecar" || echo "  ✗ Rust Sidecar"
	@echo ""
	@echo "$(YELLOW)Documentation:$(NC)"
	@test -f README.md && echo "  ✓ README.md" || echo "  ✗ README.md"
	@test -f PROJECT_INDEX.md && echo "  ✓ PROJECT_INDEX.md" || echo "  ✗ PROJECT_INDEX.md"
	@test -f PROJECT_STATUS.md && echo "  ✓ PROJECT_STATUS.md" || echo "  ✗ PROJECT_STATUS.md"
	@echo ""
	@echo "$(YELLOW)Database:$(NC)"
	@test -f prisma/schema.prisma && echo "  ✓ Prisma schema" || echo "  ✗ Prisma schema"
	@echo ""

# Quick aliases
s: setup
d: dev
b: build
t: test
tu: test-unit
te: test-e2e
td: test-deidentify
l: lint
f: format
db: docker-build
dr: docker-run
dc: docker-compose
st: status
