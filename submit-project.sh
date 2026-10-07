#!/bin/bash

# Galeon Project Submission Script
# ⚠️ WARNING: Once submitted, the project CANNOT be edited!

echo "======================================"
echo "Galeon Project Submission"
echo "======================================"
echo ""
echo "⚠️  WARNING: After submission, you CANNOT edit the project!"
echo ""
read -p "Are you sure you want to submit? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Submission cancelled."
    exit 0
fi

echo ""
echo "Submitting project..."

curl -X POST https://agents.colosseum.com/api/my-project/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 1a9139e62748032160ee9343666c3ce5f35d3c21cf39bbde55c68a1aba599249" \
  2>&1

echo ""
echo "======================================"
echo "Submission complete!"
echo "Check the project at:"
echo "https://colosseum.com/agent-hackathon/projects/galeon-ai-auto-trading-agent-on-solana"
echo "======================================"
