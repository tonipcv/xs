#!/bin/bash

# Deploy XASE De-Identification to Kubernetes

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     Deploying XASE De-Identification to Kubernetes        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
NAMESPACE="xase-deidentification"
DEPLOYMENT_NAME="xase-deidentification"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_NAME="${REGISTRY}/xase/deidentification:${IMAGE_TAG}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl not found. Please install kubectl.${NC}"
    exit 1
fi

if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}❌ Cannot connect to Kubernetes cluster.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ kubectl installed and cluster accessible${NC}"
echo ""

# Create namespace if it doesn't exist
echo "📦 Creating namespace: ${NAMESPACE}"
kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
echo -e "${GREEN}✓ Namespace ready${NC}"
echo ""

# Apply Kubernetes manifests
echo "🚀 Applying Kubernetes manifests..."
kubectl apply -f k8s/deployment.yaml
echo -e "${GREEN}✓ Manifests applied${NC}"
echo ""

# Update image
echo "🐳 Updating container image to: ${IMAGE_NAME}"
kubectl set image deployment/${DEPLOYMENT_NAME} \
  deidentification=${IMAGE_NAME} \
  -n ${NAMESPACE}
echo -e "${GREEN}✓ Image updated${NC}"
echo ""

# Wait for rollout
echo "⏳ Waiting for rollout to complete..."
kubectl rollout status deployment/${DEPLOYMENT_NAME} -n ${NAMESPACE} --timeout=5m
echo -e "${GREEN}✓ Rollout complete${NC}"
echo ""

# Get deployment status
echo "📊 Deployment Status:"
kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE}
echo ""

echo "📋 Pods:"
kubectl get pods -n ${NAMESPACE} -l app=${DEPLOYMENT_NAME}
echo ""

echo "🌐 Services:"
kubectl get svc -n ${NAMESPACE}
echo ""

# Get service endpoint
SERVICE_TYPE=$(kubectl get svc ${DEPLOYMENT_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.type}')

if [ "$SERVICE_TYPE" == "LoadBalancer" ]; then
    echo "⏳ Waiting for LoadBalancer IP..."
    kubectl wait --for=jsonpath='{.status.loadBalancer.ingress}' \
      svc/${DEPLOYMENT_NAME} -n ${NAMESPACE} --timeout=2m || true
    
    EXTERNAL_IP=$(kubectl get svc ${DEPLOYMENT_NAME} -n ${NAMESPACE} \
      -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    
    if [ -n "$EXTERNAL_IP" ]; then
        echo -e "${GREEN}✓ Service available at: http://${EXTERNAL_IP}${NC}"
    fi
elif [ "$SERVICE_TYPE" == "NodePort" ]; then
    NODE_PORT=$(kubectl get svc ${DEPLOYMENT_NAME} -n ${NAMESPACE} \
      -o jsonpath='{.spec.ports[0].nodePort}')
    echo -e "${GREEN}✓ Service available at NodePort: ${NODE_PORT}${NC}"
else
    echo -e "${YELLOW}ℹ Service type is ClusterIP. Use port-forward to access:${NC}"
    echo "   kubectl port-forward svc/${DEPLOYMENT_NAME} 3000:80 -n ${NAMESPACE}"
fi

echo ""

# Run health check
echo "🏥 Running health check..."
sleep 5

POD_NAME=$(kubectl get pods -n ${NAMESPACE} -l app=${DEPLOYMENT_NAME} \
  -o jsonpath='{.items[0].metadata.name}')

if [ -n "$POD_NAME" ]; then
    HEALTH_STATUS=$(kubectl exec -n ${NAMESPACE} ${POD_NAME} -- \
      curl -s http://localhost:3000/health | grep -o '"status":"[^"]*"' || echo "failed")
    
    if [[ "$HEALTH_STATUS" == *"healthy"* ]]; then
        echo -e "${GREEN}✓ Health check passed${NC}"
    else
        echo -e "${YELLOW}⚠ Health check returned: ${HEALTH_STATUS}${NC}"
    fi
fi

echo ""

# Show logs
echo "📜 Recent logs:"
kubectl logs -n ${NAMESPACE} deployment/${DEPLOYMENT_NAME} --tail=10
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                  DEPLOYMENT SUMMARY                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Namespace:     ${NAMESPACE}"
echo "Deployment:    ${DEPLOYMENT_NAME}"
echo "Image:         ${IMAGE_NAME}"
echo "Replicas:      $(kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.replicas}')"
echo "Ready:         $(kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} -o jsonpath='{.status.readyReplicas}')"
echo ""

# Useful commands
echo "📚 Useful commands:"
echo ""
echo "View pods:"
echo "  kubectl get pods -n ${NAMESPACE}"
echo ""
echo "View logs:"
echo "  kubectl logs -f deployment/${DEPLOYMENT_NAME} -n ${NAMESPACE}"
echo ""
echo "Port forward:"
echo "  kubectl port-forward svc/${DEPLOYMENT_NAME} 3000:80 -n ${NAMESPACE}"
echo ""
echo "Scale deployment:"
echo "  kubectl scale deployment/${DEPLOYMENT_NAME} --replicas=5 -n ${NAMESPACE}"
echo ""
echo "Delete deployment:"
echo "  kubectl delete -f k8s/deployment.yaml"
echo ""

echo -e "${GREEN}✅ Deployment complete!${NC}"
