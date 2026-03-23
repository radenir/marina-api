#!/bin/bash

# Marina API - Automated Deployment Script
# Run this on a fresh Ubuntu 22.04 server
# Usage: sudo bash deploy.sh

set -e

echo "=========================================="
echo "Marina API - Deployment"
echo "=========================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error()   { echo -e "${RED}✗ $1${NC}"; }
print_info()    { echo -e "${YELLOW}ℹ $1${NC}"; }
print_step()    { echo -e "${BLUE}▸ $1${NC}"; }

if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (use: sudo bash deploy.sh)"
    exit 1
fi

CURRENT_DIR=$(pwd)
print_info "Working directory: $CURRENT_DIR"
echo ""

print_step "Checking for required files..."
if [ ! -f "docker-compose.yml" ] || [ ! -f "Dockerfile" ] || [ ! -f "nginx.conf" ]; then
    print_error "Required files not found! Run this script from the deployment directory."
    exit 1
fi
if [ ! -f "../.env" ]; then
    print_error ".env file not found at $(realpath ../.env)!"
    print_error "Copy .env.example to .env and fill in all required values."
    exit 1
fi
print_success "All required files found"
echo ""

print_step "Step 1/6: Updating system packages..."
apt update -qq
apt upgrade -y -qq
print_success "System updated"
echo ""

print_step "Step 2/6: Installing Docker..."
if command -v docker &> /dev/null; then
    print_success "Docker already installed ($(docker --version))"
else
    apt install -y -qq apt-transport-https ca-certificates curl software-properties-common
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list
    apt update -qq
    apt install -y docker-ce docker-ce-cli containerd.io
    systemctl start docker
    systemctl enable docker > /dev/null 2>&1
    print_success "Docker installed ($(docker --version))"
fi
echo ""

print_step "Step 3/6: Installing Docker Compose..."
if command -v docker-compose &> /dev/null; then
    print_success "Docker Compose already installed ($(docker-compose --version))"
else
    curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    print_success "Docker Compose installed ($(docker-compose --version))"
fi
echo ""

print_step "Step 4/6: Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw --force disable 2>/dev/null || true
    echo "y" | ufw --force reset 2>/dev/null || true
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw default deny incoming
    ufw default allow outgoing
    echo "y" | ufw --force enable
    if ufw status | grep -q "22/tcp"; then
        print_success "Firewall configured (ports 22, 80, 443 open)"
    else
        print_error "WARNING: SSH rule not confirmed! Disabling firewall for safety..."
        ufw --force disable
    fi
else
    print_info "UFW not available, skipping firewall configuration"
fi
echo ""

print_step "Step 5/6: Creating SSL directory..."
mkdir -p ./ssl
print_success "SSL directory ready"
echo ""

print_step "Step 6/6: Building and starting Docker containers..."
docker-compose down || true
docker-compose build --no-cache
docker-compose up -d
sleep 15
print_success "Docker containers started"
echo ""

print_step "Checking container status..."
docker-compose ps
echo ""

print_step "Testing application health..."
sleep 5
if curl -f -s http://localhost:4000/health > /dev/null 2>&1; then
    print_success "API is responding on port 4000"
else
    print_error "App may not be ready yet. Check logs with: docker-compose logs -f app"
fi
echo ""

echo "=========================================="
print_success "Deployment Complete!"
echo "=========================================="
echo ""
SERVER_IP=$(curl -4 -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP')
print_info "API is running at: http://$SERVER_IP:4000/health"
echo ""
print_info "Next steps:"
echo "  1. Point DNS A record for api.marinahealth.eu to: $SERVER_IP"
echo "  2. Run: sudo bash deploy_https.sh"
echo ""
print_info "Useful commands:"
echo "  View logs:    docker-compose logs -f"
echo "  App logs:     docker-compose logs -f app"
echo "  Restart:      docker-compose restart"
echo "  Stop:         docker-compose down"
echo "  Rebuild:      sudo bash rebuild.sh"
echo ""
