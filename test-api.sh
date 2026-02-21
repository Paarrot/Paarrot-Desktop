#!/bin/bash
# Paarrot API Quick Test Script
# 
# Simple curl commands to test the API endpoints
# Make sure Paarrot is running before using these commands

API_BASE="http://127.0.0.1:33384"

echo "🚀 Paarrot API Quick Test"
echo ""

# Health check
echo "📡 Health Check:"
curl -s "$API_BASE/health" | jq '.' || curl -s "$API_BASE/health"
echo ""
echo ""

# Get status
echo "📊 Get Status:"
curl -s "$API_BASE/status" | jq '.' || curl -s "$API_BASE/status"
echo ""
echo ""

# Toggle mute
echo "🎤 Toggle Mute:"
curl -s -X POST "$API_BASE/mute/toggle" | jq '.' || curl -s -X POST "$API_BASE/mute/toggle"
echo ""
echo ""

# Toggle deafen
echo "🔇 Toggle Deafen:"
curl -s -X POST "$API_BASE/deafen/toggle" | jq '.' || curl -s -X POST "$API_BASE/deafen/toggle"
echo ""
echo ""

# Get channels
echo "📋 Get Channels:"
curl -s "$API_BASE/channels" | jq '.' || curl -s "$API_BASE/channels"
echo ""
echo ""

# Get current room
echo "🏠 Get Current Room:"
curl -s "$API_BASE/room/current" | jq '.' || curl -s "$API_BASE/room/current"
echo ""
echo ""

echo "✨ Done!"
echo ""
echo "💡 Tips:"
echo "  - Use 'jq' for pretty JSON output (install with: sudo apt install jq)"
echo "  - Check API.md for full documentation"
echo "  - Test message sending: curl -X POST $API_BASE/message/current -H 'Content-Type: application/json' -d '{\"message\": \"Hello!\"}'"
