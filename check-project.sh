#!/bin/bash

# 查看 Galeon 项目状态

echo "======================================"
echo "Galeon 项目信息"
echo "======================================"

curl -s -X GET https://agents.colosseum.com/api/my-project \
  -H "Authorization: Bearer 1a9139e62748032160ee9343666c3ce5f35d3c21cf39bbde55c68a1aba599249" \
  | python3 -m json.tool

echo ""
echo "======================================"
echo "项目访问链接："
echo "https://colosseum.com/agent-hackathon/projects/galeon-ai-auto-trading-agent-on-solana"
echo "======================================"
