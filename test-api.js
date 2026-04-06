require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic.default();

client.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 16,
  messages: [{ role: 'user', content: 'hi' }],
})
  .then(() => console.log('OK'))
  .catch((err) => {
    console.error('FAILED');
    console.error('Message:', err.message);
    console.error('Status:', err.status);
    if (err.error) console.error('API body:', JSON.stringify(err.error, null, 2));
  });
