#!/bin/bash

# Build production-ready Docker image for XASE De-Identification

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     Building XASE De-Identification Docker Image          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
IMAGE_NAME="xase/deidentification"
REGISTRY="${REGISTRY:-ghcr.io}"

echo "📦 Building image: ${IMAGE_NAME}:${VERSION}"
echo ""

# Build the image
docker build \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg VCS_REF=$(git rev-parse --short HEAD) \
  --build-arg VERSION=${VERSION} \
  -t ${IMAGE_NAME}:${VERSION} \
  -t ${IMAGE_NAME}:latest \
  .

echo ""
echo "✅ Image built successfully!"
echo ""
echo "Available tags:"
echo "  - ${IMAGE_NAME}:${VERSION}"
echo "  - ${IMAGE_NAME}:latest"
echo ""

# Test the image
echo "🧪 Testing image..."
docker run --rm ${IMAGE_NAME}:${VERSION} node --version
echo ""

# Show image size
echo "📊 Image details:"
docker images ${IMAGE_NAME}:${VERSION} --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
echo ""

echo "🚀 To run the image:"
echo "   docker run -p 3000:3000 ${IMAGE_NAME}:${VERSION}"
echo ""

echo "📤 To push to registry:"
echo "   docker tag ${IMAGE_NAME}:${VERSION} ${REGISTRY}/${IMAGE_NAME}:${VERSION}"
echo "   docker push ${REGISTRY}/${IMAGE_NAME}:${VERSION}"
echo ""
