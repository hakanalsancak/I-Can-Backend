const { query } = require('../config/database');

const ROTATING_QUESTIONS = [
  { id: 1, text: 'How focused were you during training today?', type: 'slider' },
  { id: 2, text: 'Did you give maximum effort today?', type: 'slider' },
  { id: 3, text: 'How confident did you feel today?', type: 'slider' },
  { id: 4, text: 'How well did you handle mistakes today?', type: 'slider' },
  { id: 5, text: 'How disciplined were you today?', type: 'slider' },
  { id: 6, text: 'How was your energy level today?', type: 'slider' },
  { id: 7, text: 'Did you follow your training plan today?', type: 'slider' },
  { id: 8, text: 'What did you learn today?', type: 'text' },
  { id: 9, text: 'How prepared did you feel today?', type: 'slider' },
  { id: 10, text: 'How satisfied are you with today\'s performance?', type: 'slider' },
];

const SPORTS = ['soccer', 'basketball', 'tennis', 'football', 'boxing', 'cricket'];

module.exports = { ROTATING_QUESTIONS, SPORTS, query };
