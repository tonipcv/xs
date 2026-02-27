# XASE De-Identification System - Makefile
# Versão: 2.1.0

.PHONY: help setup install test dev build docker k8s clean

# Colors
GREEN  := \033[0;32m
YELLOW := \033[1;33m
RED    := \033[0;31m
NC     := \033[0m

# Default target
.DEFAULT_GOAL := help

## help: Show this help message
help:
	@echo "$(GREEN)XASE De-Identification System - Available Commands$(NC)"
	@echo ""
	@echo "$(YELLOW)Setup:$(NC)"
	@echo "  make setup              - Complete setup (install + download data)"
	@echo "  make install            - Install dependencies"
	@echo "  make download-data      - Download real DICOM data"
	@echo ""
	@echo "$(YELLOW)Development:$(NC)"
	@echo "  make dev                - Start API server"
	@echo "  make build              - Build TypeScript"
	@echo "  make clean              - Clean build artifacts"
	@echo ""
	@echo "$(YELLOW)Testing:$(NC)"
	@echo "  make test               - Run all tests"
	@echo "  make test-dicom         - Test DICOM binary"
	@echo "  make test-e2e           - Test end-to-end"
	@echo "  make test-benchmark     - Run benchmark"
	@echo "  make test-validate      - Complete validation"
	@echo "  make test-full          - Full system test"
	@echo ""
	@echo "$(YELLOW)Reports:$(NC)"
	@echo "  make dashboard          - Generate dashboard"
	@echo "  make quality-report     - Generate quality report"
	@echo "  make demo-data          - Generate demo data"
	@echo ""
	@echo "$(YELLOW)Docker:$(NC)"
	@echo "  make docker-build       - Build Docker image"
	@echo "  make docker-run         - Run Docker container"
	@echo "  make docker-push        - Push to registry"
	@echo ""
	@echo "$(YELLOW)Kubernetes:$(NC)"
	@echo "  make k8s-deploy         - Deploy to Kubernetes"
	@echo "  make k8s-status         - Check deployment status"
	@echo "  make k8s-logs           - View logs"
	@echo "  make k8s-delete         - Delete deployment"
	@echo ""
	@echo "$(YELLOW)Utilities:$(NC)"
	@echo "  make status             - System status"
	@echo "  make lint               - Run linter"
	@echo "  make format             - Format code"
	@echo ""

## setup: Complete setup
setup: install download-data
	@echo "$(GREEN)✓ Setup complete!$(NC)"
	@echo "Run 'make test-dicom' to test with real data"

## install: Install dependencies
install:
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	npm install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

## download-data: Download real DICOM data
download-data:
	@echo "$(YELLOW)Downloading real DICOM data...$(NC)"
	npm run download:dicom-real
	@echo "$(GREEN)✓ Data downloaded$(NC)"

## dev: Start API server
dev:
	@echo "$(YELLOW)Starting API server...$(NC)"
	npm run start:api

## build: Build TypeScript
build:
	@echo "$(YELLOW)Building TypeScript...$(NC)"
	npm run build
	@echo "$(GREEN)✓ Build complete$(NC)"

## clean: Clean build artifacts
clean:
	@echo "$(YELLOW)Cleaning...$(NC)"
	rm -rf dist/
	rm -rf node_modules/
	rm -rf output/
	rm -rf demo-package/
	@echo "$(GREEN)✓ Cleaned$(NC)"

## test: Run all tests
test:
	@echo "$(YELLOW)Running all tests...$(NC)"
	npm run test:all
	@echo "$(GREEN)✓ Tests complete$(NC)"

## test-dicom: Test DICOM binary
test-dicom:
	@echo "$(YELLOW)Testing DICOM binary...$(NC)"
	npm run test:dicom-binary
	@echo "$(GREEN)✓ DICOM tests complete$(NC)"

## test-e2e: Test end-to-end
test-e2e:
	@echo "$(YELLOW)Running end-to-end tests...$(NC)"
	npm run test:e2e
	@echo "$(GREEN)✓ E2E tests complete$(NC)"

## test-benchmark: Run benchmark
test-benchmark:
	@echo "$(YELLOW)Running benchmark...$(NC)"
	npx ts-node src/advanced-benchmark.ts
	@echo "$(GREEN)✓ Benchmark complete$(NC)"

## test-validate: Complete validation
test-validate:
	@echo "$(YELLOW)Running complete validation...$(NC)"
	npx ts-node src/complete-validation.ts
	@echo "$(GREEN)✓ Validation complete$(NC)"

## test-full: Full system test
test-full:
	@echo "$(YELLOW)Running full system test...$(NC)"
	./scripts/full-system-test.sh
	@echo "$(GREEN)✓ Full test complete$(NC)"

## dashboard: Generate dashboard
dashboard:
	@echo "$(YELLOW)Generating dashboard...$(NC)"
	npm run dashboard
	@echo "$(GREEN)✓ Dashboard generated: output/monitoring/dashboard.html$(NC)"

## quality-report: Generate quality report
quality-report:
	@echo "$(YELLOW)Generating quality report...$(NC)"
	npm run quality-report
	@echo "$(GREEN)✓ Report generated: output/quality-reports/quality-report.html$(NC)"

## demo-data: Generate demo data
demo-data:
	@echo "$(YELLOW)Generating demo data...$(NC)"
	./scripts/generate-demo-data.sh
	@echo "$(GREEN)✓ Demo data ready$(NC)"

## docker-build: Build Docker image
docker-build:
	@echo "$(YELLOW)Building Docker image...$(NC)"
	docker build -t xase/deidentification:2.1.0 .
	docker tag xase/deidentification:2.1.0 xase/deidentification:latest
	@echo "$(GREEN)✓ Docker image built$(NC)"

## docker-run: Run Docker container
docker-run:
	@echo "$(YELLOW)Running Docker container...$(NC)"
	docker run -p 3000:3000 \
		-v $(PWD)/data:/app/data \
		-v $(PWD)/output:/app/output \
		xase/deidentification:2.1.0

## docker-push: Push to registry
docker-push:
	@echo "$(YELLOW)Pushing to registry...$(NC)"
	docker push xase/deidentification:2.1.0
	docker push xase/deidentification:latest
	@echo "$(GREEN)✓ Pushed to registry$(NC)"

## k8s-deploy: Deploy to Kubernetes
k8s-deploy:
	@echo "$(YELLOW)Deploying to Kubernetes...$(NC)"
	./scripts/deploy-k8s.sh
	@echo "$(GREEN)✓ Deployed to Kubernetes$(NC)"

## k8s-status: Check deployment status
k8s-status:
	@echo "$(YELLOW)Checking deployment status...$(NC)"
	kubectl get pods -n xase-deidentification
	kubectl get svc -n xase-deidentification
	kubectl get ingress -n xase-deidentification

## k8s-logs: View logs
k8s-logs:
	@echo "$(YELLOW)Viewing logs...$(NC)"
	kubectl logs -f deployment/xase-deidentification -n xase-deidentification

## k8s-delete: Delete deployment
k8s-delete:
	@echo "$(YELLOW)Deleting deployment...$(NC)"
	kubectl delete -f k8s/deployment.yaml
	@echo "$(GREEN)✓ Deployment deleted$(NC)"

## status: System status
status:
	@echo "$(GREEN)XASE De-Identification System Status$(NC)"
	@echo ""
	@echo "$(YELLOW)Version:$(NC) 2.1.0"
	@echo "$(YELLOW)Status:$(NC) Production Ready"
	@echo ""
	@echo "$(YELLOW)Engines:$(NC)"
	@test -f src/dicom-binary-deidentifier.ts && echo "  ✓ DICOM Binary" || echo "  ✗ DICOM Binary"
	@test -f src/fhir-deidentifier.ts && echo "  ✓ FHIR" || echo "  ✗ FHIR"
	@test -f src/hl7-deidentifier.ts && echo "  ✓ HL7 v2" || echo "  ✗ HL7 v2"
	@test -f src/text-deidentifier.ts && echo "  ✓ Clinical Text" || echo "  ✗ Clinical Text"
	@test -f src/audio-deidentifier.ts && echo "  ✓ Audio" || echo "  ✗ Audio"
	@echo ""
	@echo "$(YELLOW)Data:$(NC)"
	@test -d data/dicom/images && echo "  ✓ DICOM images ($(shell ls data/dicom/images/*.dcm 2>/dev/null | wc -l | tr -d ' ') files)" || echo "  ✗ DICOM images"
	@test -d data/fhir && echo "  ✓ FHIR resources ($(shell ls data/fhir/*.json 2>/dev/null | wc -l | tr -d ' ') files)" || echo "  ✗ FHIR resources"
	@test -d data/hl7 && echo "  ✓ HL7 messages ($(shell ls data/hl7/*.hl7 2>/dev/null | wc -l | tr -d ' ') files)" || echo "  ✗ HL7 messages"
	@echo ""
	@echo "$(YELLOW)Documentation:$(NC)"
	@test -f README.md && echo "  ✓ README.md" || echo "  ✗ README.md"
	@test -f SYSTEM_OVERVIEW.md && echo "  ✓ SYSTEM_OVERVIEW.md" || echo "  ✗ SYSTEM_OVERVIEW.md"
	@test -f QUICK_START.md && echo "  ✓ QUICK_START.md" || echo "  ✗ QUICK_START.md"
	@echo ""

## lint: Run linter
lint:
	@echo "$(YELLOW)Running linter...$(NC)"
	npx eslint src/**/*.ts
	@echo "$(GREEN)✓ Linting complete$(NC)"

## format: Format code
format:
	@echo "$(YELLOW)Formatting code...$(NC)"
	npx prettier --write "src/**/*.ts"
	@echo "$(GREEN)✓ Code formatted$(NC)"

# Quick aliases
t: test
td: test-dicom
te: test-e2e
tb: test-benchmark
tv: test-validate
tf: test-full
d: dev
b: build
db: docker-build
dr: docker-run
kd: k8s-deploy
ks: k8s-status
s: status
