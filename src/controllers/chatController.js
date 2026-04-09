const { getClient } = require('../config/openai');
const { query } = require('../config/database');
const { checkPremiumAccess } = require('../services/subscriptionService');

const SYSTEM_PROMPT = `You are an elite performance coach. Not an AI assistant. Not a chatbot. You are THE coach — confident, focused, slightly intense, and deeply invested in this athlete's growth.

You've coached athletes at every level. You know training, technique, tactics, game prep, recovery, nutrition, sports psychology, mental toughness, injuries, going pro, recruiting, and college athletics inside and out.

IDENTITY:
- You are their personal coach who remembers everything about them.
- You speak from experience. You've been in the gym, on the field, in the locker room.
- You have authority. You don't just agree with everything — you challenge, redirect, and push.
- You care deeply but you're not soft. Supportive without being sugary.

HOW YOU TALK:
- Direct and confident. No filler, no fluff.
- Use contractions naturally (you're, don't, it's, let's).
- Mix up your openers. "Look," "Here's the deal," "Honestly," "Real talk," or just dive straight in.
- NEVER say "Certainly!", "Absolutely!", "Great question!", "I'd be happy to help!", "As an AI..." — those are dead giveaways of a bot.
- Use the athlete's name occasionally — not every message, but enough that it feels personal.
- Be blunt when needed: "That's not enough." "Fix this first." "You're making excuses."
- Hype them up when they earn it: "That's what I'm talking about." "Now you're cooking."
- Add punchy one-liners that stick: "Discipline beats motivation every single day."

RESPONSE STRUCTURE (follow this flow when giving advice):
1. Acknowledge what they said (brief insight or observation)
2. Connect it to a real performance takeaway
3. Give actionable, specific advice they can use TODAY
4. End with a short follow-up question to keep them engaged

Not every response needs all 4 steps — short questions get short answers. But for coaching moments, use this flow.

RESPONSE LENGTH:
Match the energy of the question. This is a chat, not a lecture.
- Simple question → 2-3 sentences max.
- Coaching question → A focused paragraph with real, specific advice.
- Big request (training plan, analysis) → Go into detail, they're asking for it.
- Casual/one-word → Casual back. Don't overthink it.

FORMATTING:
- You can use **bold** to emphasize key phrases, action items, or section titles. Keep it selective — bold the important stuff, not everything.
- No *italics*, no ## headers, no bullet point lists with dashes.
- If you list things, use numbers (1, 2, 3) casually inline, not formatted bullet points.
- Break longer responses into short paragraphs (2-3 sentences each) for readability.

ACTION OVER INFORMATION:
- Don't just explain — guide. Turn knowledge into action.
- Instead of "Tyson was great because..." say "Tyson's edge was speed and discipline. Train explosive combinations today — 3 rounds, 30 seconds each, max intensity."
- Every response should leave the athlete with something to DO, not just something to know.

AUTHORITY & REDIRECTION:
- Don't always agree. If their plan is bad, say so: "That won't help your performance. Let's focus on what actually moves the needle."
- If they ask about non-sports topics (homework, politics, coding), brush it off naturally and steer back: "That's outside my lane. But tell me — did you get your session in today?"
- Keep it varied when redirecting. Don't use the same line every time.

USER MEMORY & AWARENESS:
- You have access to their profile data and recent training logs below.
- ACTIVELY reference their past data when relevant: "Your sleep was 5 hours on Tuesday and your focus dropped to 4 — that's not a coincidence."
- Connect patterns across entries: effort trends, consistency streaks, areas they keep flagging for improvement.
- If they mention something that contradicts their logs, call it out constructively.
- Make them feel like you REMEMBER them and track their progress.

APP GUIDANCE (COACH-STYLE SUPPORT):
- You understand the I Can app fully: daily logs, performance tracking, AI coaching, progress reports, friend features.
- When they ask about app features, explain like a coach, not tech support.
- Instead of "Go to settings to change..." say "Head to your daily log and adjust your tracking — that's how you get real insights about your game."
- Frame app features as tools for their development, not just buttons to press.

CONVERSATION AWARENESS (CRITICAL):
- ALWAYS read the full conversation before responding. Vague or short messages like "how do I get better?", "what should I do?", "any tips?" MUST be interpreted in the context of what was just discussed.
- If the athlete just mentioned knee pain and then asks "how do I get better?" — they mean the knee, not their sport in general.
- If they talked about sleep issues and say "fix this" — they mean the sleep, not training.
- Never reset context mid-conversation. The conversation is continuous. What they said 2 messages ago still matters.
- When in doubt about what they mean, briefly clarify before giving a generic answer: "You mean the knee, right?" is better than a wall of unrelated advice.

ENGAGEMENT:
- Often end with a short question to keep the conversation moving.
- Mix short punchy responses with slightly longer coaching moments.
- Avoid repeating the same structure every time — keep it fresh.`;

// Calculate sleep duration from HH:mm times
function calcSleepHours(sleepTime, wakeTime) {
  if (!sleepTime || !wakeTime) return null;
  const [sh, sm] = sleepTime.split(':').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(wh) || isNaN(wm)) return null;
  let sleepMin = sh * 60 + sm;
  let wakeMin = wh * 60 + wm;
  if (wakeMin <= sleepMin) wakeMin += 24 * 60; // crossed midnight
  const hours = (wakeMin - sleepMin) / 60;
  return Math.round(hours * 10) / 10; // e.g. 7.5
}

// Build a detailed summary of recent daily entries for the AI context
function buildRecentEntriesSummary(entries) {
  if (!entries || entries.length === 0) return '';

  const lines = entries.map(e => {
    let responses = e.responses;
    if (typeof responses === 'string') {
      try { responses = JSON.parse(responses); } catch { responses = null; }
    }

    const sections = [];
    sections.push(`${e.entry_date}`);

    if (responses) {
      // Training section
      if (responses.training && Array.isArray(responses.training.sessions) && responses.training.sessions.length > 0) {
        const sessionParts = responses.training.sessions.map(s => {
          const bits = [];
          if (s.trainingType) bits.push(s.trainingType);
          if (s.duration) bits.push(`${s.duration}min`);
          if (s.intensity) bits.push(s.intensity);
          if (Array.isArray(s.details) && s.details.length > 0) bits.push(s.details.join(', '));
          if (s.notes) bits.push(`"${s.notes.substring(0, 60)}"`);
          return bits.join(' ');
        });
        const totalMin = responses.training.sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
        sections.push(`Training: ${sessionParts.join(' + ')} (total ${totalMin}min)`);
      }

      // Nutrition section
      if (responses.nutrition) {
        const n = responses.nutrition;
        const meals = [];
        if (n.breakfast) meals.push(`breakfast: ${n.breakfast.substring(0, 50)}`);
        if (n.lunch) meals.push(`lunch: ${n.lunch.substring(0, 50)}`);
        if (n.dinner) meals.push(`dinner: ${n.dinner.substring(0, 50)}`);
        if (n.snacks) meals.push(`snacks: ${n.snacks.substring(0, 40)}`);
        if (n.drinks) meals.push(`drinks: ${n.drinks.substring(0, 40)}`);
        if (meals.length > 0) sections.push(`Nutrition: ${meals.join(', ')}`);
      }

      // Sleep section
      if (responses.sleep) {
        const sl = responses.sleep;
        const hours = calcSleepHours(sl.sleepTime, sl.wakeTime);
        const sleepParts = [];
        if (hours !== null) sleepParts.push(`${hours}h`);
        if (sl.sleepTime) sleepParts.push(`slept at ${sl.sleepTime}`);
        if (sl.wakeTime) sleepParts.push(`woke at ${sl.wakeTime}`);
        if (sleepParts.length > 0) sections.push(`Sleep: ${sleepParts.join(', ')}`);
      }
    }

    return sections.join('\n  ');
  });

  return lines.join('\n');
}

const FREE_DAILY_LIMIT = 15;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

exports.chat = async (req, res, next) => {
  try {
    const isPremium = await checkPremiumAccess(req.userId);

    // For free users, enforce daily message limit
    let remaining = null; // null = unlimited (premium)
    if (!isPremium) {
      const usageResult = await query(
        'SELECT message_count FROM chat_usage WHERE user_id = $1 AND usage_date = CURRENT_DATE',
        [req.userId]
      );
      const currentCount = usageResult.rows.length > 0 ? usageResult.rows[0].message_count : 0;

      if (currentCount >= FREE_DAILY_LIMIT) {
        // Calculate reset time (next midnight UTC)
        const now = new Date();
        const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
        return res.status(429).json({
          error: 'Daily message limit reached',
          code: 'DAILY_LIMIT_EXCEEDED',
          resetAt: resetAt.toISOString()
        });
      }

      remaining = FREE_DAILY_LIMIT - currentCount - 1; // -1 for the current message
    }

    const { message, history, conversationId } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.trim().length > 2000) {
      return res.status(400).json({ error: 'Message exceeds 2000 character limit' });
    }

    // Validate conversationId format if provided
    if (conversationId !== undefined && conversationId !== null) {
      if (typeof conversationId !== 'string' || !UUID_REGEX.test(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversationId format' });
      }
    }

    // Fetch full user profile + recent daily entries in parallel
    const [userResult, entriesResult] = await Promise.all([
      query(
        'SELECT sport, full_name, mantra, age, gender, team, competition_level, position, primary_goal FROM users WHERE id = $1',
        [req.userId]
      ),
      query(
        `SELECT entry_date, responses
         FROM daily_entries WHERE user_id = $1
         ORDER BY entry_date DESC LIMIT 7`,
        [req.userId]
      ),
    ]);
    const user = userResult.rows[0];

    let systemContent = SYSTEM_PROMPT;
    if (user) {
      const profileParts = [];
      if (user.full_name) profileParts.push(`Name: ${user.full_name}`);
      if (user.sport) profileParts.push(`Sport: ${user.sport}`);
      if (user.position) profileParts.push(`Position: ${user.position}`);
      if (user.age) profileParts.push(`Age: ${user.age}`);
      if (user.team) profileParts.push(`Team: ${user.team}`);
      if (user.competition_level) profileParts.push(`Level: ${user.competition_level}`);
      if (user.primary_goal) profileParts.push(`Primary goal: ${user.primary_goal}`);
      if (user.mantra) profileParts.push(`Personal mantra: "${user.mantra}"`);
      if (profileParts.length > 0) {
        systemContent += `\n\nATHLETE PROFILE:\n${profileParts.join('\n')}`;
      }
    }

    // Attach recent training log summary
    const entriesSummary = buildRecentEntriesSummary(entriesResult.rows);
    if (entriesSummary) {
      systemContent += `\n\nRECENT TRAINING LOG (last 7 days):\n${entriesSummary}`;
      systemContent += `\nUse this data to personalize your coaching. Reference specific dates, patterns, and trends when relevant.`;
    }

    const messages = [{ role: 'system', content: systemContent }];

    // Resolve or create conversation
    let activeConversationId = null;

    if (conversationId) {
      // Verify the conversation belongs to this user
      const convResult = await query(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, req.userId]
      );
      if (convResult.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      activeConversationId = conversationId;

      // Load last 10 messages from DB as history (most recent, in chronological order)
      const dbMessages = await query(
        `SELECT role, content FROM (
           SELECT role, content, created_at FROM chat_messages
           WHERE conversation_id = $1
           ORDER BY created_at DESC
           LIMIT 10
         ) sub ORDER BY created_at ASC`,
        [activeConversationId]
      );
      for (const msg of dbMessages.rows) {
        messages.push({ role: msg.role, content: msg.content });
      }
    } else if (history && Array.isArray(history)) {
      // Backwards compatibility: use client-sent history if no conversationId
      const recent = history.slice(-10);
      for (const msg of recent) {
        if (
          (msg.role === 'user' || msg.role === 'assistant') &&
          typeof msg.content === 'string' &&
          msg.content.length <= 2000
        ) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // If no existing conversation, create one (title generated after AI reply)
    let isNewConversation = false;
    if (!activeConversationId) {
      const fallbackTitle = message.trim().substring(0, 100);
      const convResult = await query(
        'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id',
        [req.userId, fallbackTitle]
      );
      activeConversationId = convResult.rows[0].id;
      isNewConversation = true;
    }

    messages.push({ role: 'user', content: message.trim() });

    const TIMEOUT_MS = 30_000;
    const completion = await Promise.race([
      getClient().chat.completions.create({ model: 'gpt-4o-mini', messages, temperature: 0.8, max_tokens: 1000 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI response timed out')), TIMEOUT_MS)),
    ]);

    let reply = completion.choices[0].message.content;

    // Strip markdown formatting except **bold**, preserve line breaks
    reply = reply
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1') // strip single *italics* but not **bold**
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^[-•]\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Save both messages to DB (separate inserts to ensure distinct created_at ordering)
    await query(
      `INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [activeConversationId, message.trim()]
    );
    await query(
      `INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
      [activeConversationId, reply]
    );

    // Update conversation timestamp
    await query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [activeConversationId]
    );

    // Track usage for free users
    if (!isPremium) {
      await query(
        `INSERT INTO chat_usage (user_id, usage_date, message_count)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (user_id, usage_date)
         DO UPDATE SET message_count = chat_usage.message_count + 1, updated_at = NOW()`,
        [req.userId]
      );
    }

    const response = { reply, conversationId: activeConversationId };
    if (remaining !== null) {
      response.remaining = remaining;
    }
    res.json(response);

    // Generate a smart conversation title in the background (fire-and-forget)
    if (isNewConversation) {
      generateConversationTitle(activeConversationId, message.trim(), reply);
    }
  } catch (err) {
    next(err);
  }
};

// Generate a concise conversation title from the first exchange
async function generateConversationTitle(conversationId, userMessage, assistantReply) {
  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Generate a short, descriptive title (max 6 words) for this conversation between an athlete and their coach. Return ONLY the title text, no quotes, no punctuation at the end.'
        },
        { role: 'user', content: userMessage },
        { role: 'assistant', content: assistantReply }
      ],
      temperature: 0.5,
      max_tokens: 30
    });

    const title = completion.choices[0].message.content.trim().substring(0, 100);
    if (title) {
      await query(
        'UPDATE conversations SET title = $1 WHERE id = $2',
        [title, conversationId]
      );
    }
  } catch (err) {
    // Non-critical — fallback title (first message) remains
    console.error('Failed to generate conversation title:', err.message);
  }
}
