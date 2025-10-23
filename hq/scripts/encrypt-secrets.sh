#!/bin/bash

# SOPS Secret Encryption Script
# Usage: ./encrypt-secrets.sh

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🔐 Ghost Recon Secret Encryption${NC}"
echo "================================"

# Check if SOPS is installed
if ! command -v sops &> /dev/null; then
    echo -e "${RED}❌ SOPS is not installed${NC}"
    echo "Install with: brew install sops"
    exit 1
fi

# Check if age is installed
if ! command -v age &> /dev/null; then
    echo -e "${RED}❌ age is not installed${NC}"
    echo "Install with: brew install age"
    exit 1
fi

# Generate age key if it doesn't exist
if [ ! -f ~/.config/sops/age/keys.txt ]; then
    echo -e "${YELLOW}Generating new age key...${NC}"
    mkdir -p ~/.config/sops/age
    age-keygen -o ~/.config/sops/age/keys.txt
    echo -e "${GREEN}✅ Age key generated${NC}"
fi

# Show public key
PUBLIC_KEY=$(grep "public key:" ~/.config/sops/age/keys.txt | cut -d: -f2 | tr -d ' ')
echo -e "${GREEN}Public key: ${PUBLIC_KEY}${NC}"
echo "Add this to .sops.yaml creation_rules"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env from template...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env with your actual secret values${NC}"
    exit 0
fi

# Encrypt .env file
echo -e "${YELLOW}Encrypting .env file...${NC}"
sops --encrypt .env > .env.enc

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Secrets encrypted to .env.enc${NC}"
    
    # Remove plain text .env
    echo -e "${YELLOW}Removing plain text .env...${NC}"
    rm .env
    echo -e "${GREEN}✅ Plain text secrets removed${NC}"
else
    echo -e "${RED}❌ Failed to encrypt secrets${NC}"
    exit 1
fi

# Create GitHub Actions secret instructions
echo ""
echo "================================"
echo -e "${GREEN}GitHub Actions Setup:${NC}"
echo ""
echo "1. Get your age secret key:"
echo "   cat ~/.config/sops/age/keys.txt | grep AGE-SECRET-KEY"
echo ""
echo "2. Add to GitHub Secrets:"
echo "   gh secret set SOPS_AGE_KEY --body 'YOUR-AGE-SECRET-KEY'"
echo ""
echo "3. Update .github/workflows/deploy.yml:"
echo "   - name: Decrypt secrets"
echo "     env:"
echo "       SOPS_AGE_KEY: \${{ secrets.SOPS_AGE_KEY }}"
echo "     run: |"
echo "       echo \"\$SOPS_AGE_KEY\" > ~/.config/sops/age/keys.txt"
echo "       sops --decrypt .env.enc > .env"