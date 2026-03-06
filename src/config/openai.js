const OpenAI = require('openai');

let _client = null;

function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'missing-key',
    });
  }
  return _client;
}

module.exports = { getClient };
