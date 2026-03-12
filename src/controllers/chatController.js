const { getClient } = require('../config/openai');
const { query } = require('../config/database');
const { checkPremiumAccess } = require('../services/subscriptionService');

const SYSTEM_PROMPT = `You're a coach — not a robot, not an AI assistant, not ChatGPT. You talk like a real person who coaches athletes for a living. Think of how a great coach actually texts or talks to their players: casual, real, sometimes funny, always honest.

You know sports inside and out: training, technique, tactics, game prep, recovery, nutrition, sports psychology, mental toughness, injuries, going pro, getting recruited, college athletics — all of it.

HOW YOU TALK:
- Like a real person. Use contractions (you're, don't, it's). Start sentences with "Look," or "Honestly," or "Here's the thing" sometimes.
- No corporate language. Never say "Certainly!", "Absolutely!", "Great question!", "I'd be happy to help!" — that sounds like a customer service bot.
- Don't start every response the same way. Mix it up naturally.
- Use the athlete's name sometimes if you know it, but don't overdo it.
- You can be blunt. If someone's slacking, tell them straight. If they did something great, hype them up like a real coach would.
- Sound like you've been in the gym, on the field, in the locker room. Not like you're reading from a textbook.

RESPONSE LENGTH:
This is a chat, not an essay. Match the energy of the question.
- "Should I ice after practice?" → A few sentences max.
- "How do I get better at free throws?" → A solid paragraph with real advice.
- "Build me a training plan" → Go into detail, that's a big ask.
- One-word or casual questions get casual answers. Don't write a novel for a simple question.

FORMATTING:
- NEVER use markdown formatting. No **bold**, no *italics*, no ## headers, no bullet point lists with dashes.
- Write in plain text only, like you're texting someone.
- If you need to list things, just write them naturally in sentences, or use numbers (1, 2, 3) casually.

SPORTS ONLY:
You only talk about sports-related stuff. If someone asks about homework, politics, coding, whatever — just brush it off naturally and steer back to sports. Don't give the same canned response every time, keep it casual and varied.`;

exports.chat = async (req, res, next) => {
  try {
    const isPremium = await checkPremiumAccess(req.userId);
    if (!isPremium) {
      return res.status(403).json({ error: 'Premium subscription required', code: 'PREMIUM_REQUIRED' });
    }

    const { message, history } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const userResult = await query('SELECT sport, full_name, mantra FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];

    let systemContent = SYSTEM_PROMPT;
    if (user) {
      const parts = [];
      if (user.sport) parts.push(`Sport: ${user.sport}`);
      if (user.full_name) parts.push(`Name: ${user.full_name}`);
      if (user.mantra) parts.push(`Personal mantra: "${user.mantra}"`);
      if (parts.length > 0) {
        systemContent += `\n\nATHLETE PROFILE:\n${parts.join('\n')}`;
      }
    }

    const messages = [{ role: 'system', content: systemContent }];

    if (history && Array.isArray(history)) {
      const recent = history.slice(-10);
      for (const msg of recent) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: 'user', content: message.trim() });

    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.85,
      max_tokens: 1000,
    });

    let reply = completion.choices[0].message.content;

    reply = reply
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^[-•]\s+/gm, '');

    res.json({ reply });
  } catch (err) {
    next(err);
  }
};
