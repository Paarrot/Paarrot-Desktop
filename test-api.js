#!/usr/bin/env node
/**
 * Paarrot API Test Script
 * 
 * Simple test script to verify the API server is working.
 * Run this while Paarrot is running to test the API endpoints.
 * 
 * Usage: node test-api.js
 */

const API_BASE = 'http://127.0.0.1:33384';

async function testEndpoint(name, method, path, body = null) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   ${method} ${API_BASE}${path}`);
  
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
      console.log(`   Body:`, body);
    }
    
    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`   ✅ Success (${response.status})`);
      console.log(`   Response:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`   ❌ Failed (${response.status})`);
      console.log(`   Error:`, data.error || data);
    }
    
    return data;
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
    return null;
  }
}

async function runTests() {
  console.log('🚀 Paarrot API Test Suite\n');
  console.log('Make sure Paarrot is running before running these tests!\n');
  
  // Health check
  await testEndpoint('Health Check', 'GET', '/health');
  
  // Get status
  await testEndpoint('Get Status', 'GET', '/status');
  
  // Get channels
  await testEndpoint('Get Channels', 'GET', '/channels');
  
  // Get current room
  await testEndpoint('Get Current Room', 'GET', '/room/current');

  // Recent messages by scope
  await testEndpoint('Get Group Messages', 'GET', '/messages/groups');
  await testEndpoint('Get DM Messages', 'GET', '/messages/dms');
  await testEndpoint('Get Combined Messages', 'GET', '/messages/combined?limit=10');

  // Unread conversations by scope
  await testEndpoint('Get Group Unreads', 'GET', '/unreads/groups');
  await testEndpoint('Get DM Unreads', 'GET', '/unreads/dms');
  await testEndpoint('Get Combined Unreads', 'GET', '/unreads/combined');
  
  // Toggle mute
  await testEndpoint('Toggle Mute', 'POST', '/mute/toggle');
  
  // Set mute
  await testEndpoint('Set Mute (true)', 'POST', '/mute', { muted: true });
  await new Promise(resolve => setTimeout(resolve, 500));
  await testEndpoint('Set Mute (false)', 'POST', '/mute', { muted: false });
  
  // Toggle deafen
  await testEndpoint('Toggle Deafen', 'POST', '/deafen/toggle');
  
  // Send message to current room (commented out to avoid spam)
  // await testEndpoint('Send Message to Current', 'POST', '/message/current', {
  //   message: 'Test message from API'
  // });
  
  // Test invalid endpoint
  await testEndpoint('Invalid Endpoint (should 404)', 'GET', '/invalid');
  
  console.log('\n✨ Tests complete!\n');
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testEndpoint, runTests };
