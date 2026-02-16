#!/bin/bash
# Alternative deployment using SCP
# Usage: ./deploy.sh

SERVER="38.165.20.222"
REMOTE_PATH="/www/wwwroot/farmgeeker/"
LOCAL_PATH="/Users/justin/.openclaw/workspace/projects/wecom-ops/landing/"

echo "Deploying landing pages to $SERVER..."
echo ""
echo "Please run these commands manually:"
echo ""
echo "# Deploy index.html"
echo "scp ${LOCAL_PATH}index.html root@${SERVER}:${REMOTE_PATH}index.html"
echo ""
echo "# Deploy partner.html"
echo "scp ${LOCAL_PATH}partner.html root@${SERVER}:${REMOTE_PATH}partner.html"
echo ""
echo "Or use this one-liner:"
echo "scp ${LOCAL_PATH}*.html root@${SERVER}:${REMOTE_PATH}"
echo ""
echo "After deployment, verify at:"
echo "  - http://38.165.20.222/"
echo "  - http://38.165.20.222/partner.html"
