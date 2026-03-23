#!/bin/bash

# Marina API - HTTPS Setup Script
# Run this AFTER deploy.sh to add SSL/HTTPS support
# Usage: sudo bash deploy_https.sh
# Domain: api.marinahealth.eu

set -e

echo "=========================================="
echo "Marina API - HTTPS Setup"
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

DOMAIN="api.marinahealth.eu"
EMAIL="admin@marinahealth.eu"

if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (use: sudo bash deploy_https.sh)"
    exit 1
fi

CURRENT_DIR=$(pwd)
print_info "Working directory: $CURRENT_DIR"
echo ""

print_step "Checking deployment files..."
if [ ! -f "docker-compose.yml" ] || [ ! -f "nginx.conf" ]; then
    print_error "Required files not found! Run this script from the deployment directory."
    exit 1
fi
print_success "Deployment files found"
echo ""

print_step "Checking Docker containers..."
if ! docker-compose ps | grep -q "Up"; then
    print_error "Docker containers are not running! Please run deploy.sh first."
    exit 1
fi
print_success "Docker containers are running"
echo ""

print_step "Step 1/6: Installing Certbot..."
if command -v certbot &> /dev/null; then
    print_success "Certbot already installed ($(certbot --version 2>&1 | head -n1))"
else
    apt update -qq
    apt install -y snapd
    snap install core
    snap refresh core
    apt remove -y certbot 2>/dev/null || true
    snap install --classic certbot
    ln -sf /snap/bin/certbot /usr/bin/certbot
    print_success "Certbot installed"
fi
echo ""

print_step "Step 2/6: Verifying DNS configuration..."
DOMAIN_IP=$(dig +short $DOMAIN | tail -n1)
SERVER_IP=$(curl -4 -s ifconfig.me)

if [ -z "$DOMAIN_IP" ]; then
    print_error "Domain $DOMAIN does not resolve!"
    print_error "Add an A record pointing to $SERVER_IP and wait for DNS propagation."
    exit 1
fi

print_info "Domain resolves to: $DOMAIN_IP"
print_info "Server IP: $SERVER_IP"

if [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
    print_error "DNS mismatch: $DOMAIN points to $DOMAIN_IP but server is $SERVER_IP"
    exit 1
fi
print_success "DNS is correctly configured"
echo ""

print_step "Step 3/6: Stopping nginx temporarily..."
docker-compose stop nginx
print_success "Nginx stopped"
echo ""

print_step "Step 4/6: Obtaining SSL certificate from Let's Encrypt..."
certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --domains "$DOMAIN" \
    --preferred-challenges http

if [ $? -eq 0 ]; then
    print_success "SSL certificate obtained!"
else
    print_error "Failed to obtain SSL certificate"
    docker-compose start nginx
    exit 1
fi
echo ""

print_step "Step 5/6: Configuring SSL certificates..."
mkdir -p ./ssl
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem ./ssl/
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem ./ssl/
chmod 644 ./ssl/fullchain.pem
chmod 600 ./ssl/privkey.pem
print_success "Certificates configured"
echo ""

print_step "Step 6/6: Updating nginx configuration with HTTPS..."

[ ! -f "nginx.conf.backup" ] && cp nginx.conf nginx.conf.backup

cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    # Audio uploads up to 25MB (transcribe endpoint)
    client_max_body_size 30M;

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log warn;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types application/json application/javascript text/plain text/xml;

    # HTTP — redirect to HTTPS
    server {
        listen 80;
        server_name api.marinahealth.eu;
        location /.well-known/acme-challenge/ { root /var/www/certbot; }
        location / { return 301 https://$host$request_uri; }
    }

    # HTTPS
    server {
        listen 443 ssl;
        http2 on;
        server_name api.marinahealth.eu;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;

        # All API routes
        location / {
            proxy_pass http://app:4000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            # AI endpoints (extract, generate-pdf, interview) can take time
            proxy_read_timeout 120s;
            proxy_connect_timeout 10s;
            proxy_send_timeout 120s;
        }
    }
}
EOF

print_success "Nginx configuration updated with SSL"
echo ""

docker-compose up -d nginx
sleep 5

if docker-compose ps nginx | grep -q "Up"; then
    print_success "Nginx restarted successfully"
else
    print_error "Nginx failed to start! Restoring backup..."
    cp nginx.conf.backup nginx.conf
    docker-compose up -d nginx
    exit 1
fi
echo ""

print_step "Setting up automatic certificate renewal..."
cat > /usr/local/bin/renew-ssl-api.sh << 'RENEWAL_EOF'
#!/bin/bash
# Certificate renewal for api.marinahealth.eu

DEPLOY_DIR=$(find /root /home -name "docker-compose.yml" -path "*/marina-api/deployment/*" 2>/dev/null | head -n1 | xargs dirname)
cd "$DEPLOY_DIR" || exit 1

docker-compose stop nginx
certbot renew --quiet
cp /etc/letsencrypt/live/api.marinahealth.eu/fullchain.pem ./ssl/
cp /etc/letsencrypt/live/api.marinahealth.eu/privkey.pem ./ssl/
chmod 644 ./ssl/fullchain.pem
chmod 600 ./ssl/privkey.pem
docker-compose up -d nginx
RENEWAL_EOF

chmod +x /usr/local/bin/renew-ssl-api.sh
(crontab -l 2>/dev/null; echo "0 0,12 * * * /usr/local/bin/renew-ssl-api.sh >> /var/log/ssl-renewal-api.log 2>&1") | crontab -
print_success "Automatic renewal configured (runs twice daily)"
echo ""

print_step "Testing HTTPS connection..."
sleep 3
if curl -f -s -o /dev/null https://$DOMAIN/health; then
    print_success "HTTPS is working!"
else
    print_info "Certificate installed; HTTPS may take a moment to be accessible."
fi
echo ""

echo "=========================================="
print_success "HTTPS Setup Complete!"
echo "=========================================="
echo ""
print_info "API is now available at: https://$DOMAIN"
echo ""
print_info "Useful commands:"
echo "  Check cert:        certbot certificates"
echo "  Manual renewal:    sudo /usr/local/bin/renew-ssl-api.sh"
echo "  Renewal log:       tail -f /var/log/ssl-renewal-api.log"
echo "  Test renewal:      certbot renew --dry-run"
echo "  Nginx logs:        docker-compose logs -f nginx"
echo ""
