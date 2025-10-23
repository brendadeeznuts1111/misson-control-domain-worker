#!/bin/bash

# Ghost Recon Canary Ramp Script
# Usage: ./canary-ramp.sh [staging|production] [percentage]

set -e

ENV=${1:-staging}
PERCENTAGE=${2:-10}
KV_NAMESPACE="DEAD_MAN_FUSE"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Ghost Recon Canary Ramp Controller${NC}"
echo "================================"

# Function to update canary percentage
update_canary() {
    local env=$1
    local percent=$2
    
    echo -e "${YELLOW}Setting canary to ${percent}% in ${env}...${NC}"
    echo "${percent}" | wrangler kv:key put CANARY_PERCENT --env "${env}" --binding "${KV_NAMESPACE}"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Canary updated to ${percent}%${NC}"
    else
        echo -e "${RED}❌ Failed to update canary${NC}"
        exit 1
    fi
}

# Function to check metrics
check_metrics() {
    local env=$1
    local url="https://mission-control-hq-${env}.utahj4754.workers.dev/api/ghost/heartbeat"
    
    echo -e "${YELLOW}Checking metrics...${NC}"
    
    # Capture response time
    response_time=$(curl -w "%{time_total}" -o /dev/null -s "${url}")
    
    # Get heartbeat data
    heartbeat=$(curl -s "${url}" | jq -r '.heartbeat')
    
    if [ ! -z "$heartbeat" ]; then
        echo -e "${GREEN}✅ Heartbeat OK - Response time: ${response_time}s${NC}"
        
        # Extract metrics
        errors=$(echo "$heartbeat" | jq -r '.metrics.errors')
        requests=$(echo "$heartbeat" | jq -r '.metrics.requests')
        p50=$(echo "$heartbeat" | jq -r '.metrics.latencyP50')
        p99=$(echo "$heartbeat" | jq -r '.metrics.latencyP99')
        
        echo "  Errors: ${errors}/${requests} ($(echo "scale=2; $errors*100/$requests" | bc)%)"
        echo "  P50 Latency: ${p50}ms"
        echo "  P99 Latency: ${p99}ms"
        
        # Check if error rate is acceptable
        error_rate=$(echo "scale=2; $errors*100/$requests" | bc)
        if (( $(echo "$error_rate > 5" | bc -l) )); then
            echo -e "${RED}⚠️  Warning: Error rate ${error_rate}% exceeds 5% threshold${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Failed to get heartbeat${NC}"
        return 1
    fi
}

# Function to run P95 latency test
test_p95_latency() {
    local env=$1
    local url="https://mission-control-hq-${env}.utahj4754.workers.dev/api/health"
    
    echo -e "${YELLOW}Running P95 latency test (100 requests)...${NC}"
    
    # Run 100 requests and capture times
    times=""
    for i in {1..100}; do
        time=$(curl -w "%{time_total}\n" -o /dev/null -s "${url}")
        times="${times}${time}\n"
        echo -n "."
    done
    echo ""
    
    # Calculate P95
    p95=$(echo -e "${times}" | sort -n | awk 'NR==95{printf "%.3f", $1 * 1000}')
    echo -e "${GREEN}P95 Latency: ${p95}ms${NC}"
    
    # Check if P95 is acceptable
    if (( $(echo "$p95 > 500" | bc -l) )); then
        echo -e "${RED}⚠️  Warning: P95 latency ${p95}ms exceeds 500ms threshold${NC}"
        return 1
    fi
}

# Main ramp logic
case "$PERCENTAGE" in
    10)
        echo "📊 Stage 1: 10% Canary Deployment"
        update_canary "$ENV" 10
        sleep 5
        check_metrics "$ENV"
        test_p95_latency "$ENV"
        echo -e "${GREEN}Stage 1 complete. Monitor for 24 hours before proceeding.${NC}"
        ;;
    50)
        echo "📊 Stage 2: 50% Canary Deployment"
        update_canary "$ENV" 50
        sleep 5
        check_metrics "$ENV"
        test_p95_latency "$ENV"
        echo -e "${GREEN}Stage 2 complete. Monitor for 24 hours before proceeding.${NC}"
        ;;
    100)
        echo "📊 Stage 3: 100% Canary Deployment"
        update_canary "$ENV" 100
        sleep 5
        check_metrics "$ENV"
        test_p95_latency "$ENV"
        echo -e "${GREEN}Stage 3 complete. Full canary rollout successful!${NC}"
        ;;
    0)
        echo "🔄 Emergency Rollback: 0% Canary"
        update_canary "$ENV" 0
        echo -e "${YELLOW}Canary disabled. All traffic to stable.${NC}"
        ;;
    *)
        echo "📊 Custom Canary: ${PERCENTAGE}%"
        update_canary "$ENV" "$PERCENTAGE"
        sleep 5
        check_metrics "$ENV"
        ;;
esac

# Final status
echo ""
echo "================================"
current=$(wrangler kv:key get CANARY_PERCENT --env "${ENV}" --binding "${KV_NAMESPACE}" 2>/dev/null || echo "0")
echo -e "${GREEN}Current canary percentage: ${current}%${NC}"

# Create monitoring dashboard URL
echo ""
echo "📊 Monitor at:"
echo "  https://mission-control-hq-${ENV}.utahj4754.workers.dev/api/ghost/proof"
echo "  https://mission-control-hq-${ENV}.utahj4754.workers.dev/api/ghost/badge.svg"