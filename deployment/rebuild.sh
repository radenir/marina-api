#!/bin/bash

# Marina API - Rebuild Docker containers
# Usage: sudo bash rebuild.sh

set -e

echo "=========================================="
echo "Marina API - Rebuilding Docker Containers"
echo "=========================================="
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info()    { echo -e "${YELLOW}ℹ $1${NC}"; }
print_error()   { echo -e "${RED}✗ $1${NC}"; }

print_info "Stopping existing containers..."
docker-compose down
print_success "Containers stopped"
echo ""

print_info "Rebuilding Docker images (this may take a few minutes)..."
docker-compose build --no-cache
print_success "Build complete"
echo ""

print_info "Starting containers..."
docker-compose up -d
print_success "Containers started"
echo ""

print_info "Waiting for application to start..."
sleep 15

print_info "Container status:"
docker-compose ps
echo ""

print_info "Testing health endpoint..."
if curl -f -s http://localhost:4000/health > /dev/null 2>&1; then
    print_success "API is healthy"
else
    print_error "API health check failed. Check logs: docker-compose logs -f app"
fi
echo ""

print_success "Rebuild complete!"
echo "API: https://api.marinahealth.eu"
echo ""
