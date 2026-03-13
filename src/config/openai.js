const OpenAI = require('openai');

let _client = null;

function getClient() {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set');
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

module.exports = { getClient };
