/**
 * AI-powered Nutrition Health Scorer for Athletes
 * Uses GPT-4o-mini to analyze meal descriptions and return a 1-100 health score.
 * 1 = extremely unhealthy, 100 = extremely healthy
 */

const { getClient } = require('../config/openai');

const SYSTEM_PROMPT = `You are a strict sports nutritionist scoring an athlete's daily meals on a 1-100 scale.

SCORING RULES:
- 1-15: Catastrophic (all junk food, fast food, candy, soda, no real nutrition)
- 16-30: Very poor (mostly processed/junk, maybe one decent item)
- 31-45: Poor (some real food but heavy on unhealthy choices)
- 46-55: Below average (mix of good and bad, not ideal for an athlete)
- 56-65: Average (decent meals but room for improvement)
- 66-75: Good (mostly healthy, balanced meals with minor issues)
- 76-85: Very good (well-balanced, high protein, good carbs, vegetables)
- 86-95: Excellent (ideal athlete nutrition, lean protein, complex carbs, vegetables, hydration)
- 96-100: Perfect (textbook athlete meal plan)

CRITICAL FACTORS:
- QUANTITIES MATTER: "10 croissants" is far worse than "1 croissant". Large quantities of junk multiply the penalty.
- Junk food (chips, doritos, candy, chocolate bars, crisps) as main meals = very low score
- Energy drinks, soda = significant penalty
- No vegetables or protein in any meal = penalty
- All meals being unhealthy = score should be under 20
- Breakfast is important for athletes - skipping or junk breakfast = penalty
- Water/hydration = bonus
- Lean protein (chicken, fish, eggs) = bonus
- Vegetables and fruits = bonus

Respond with ONLY a JSON object: {"score": <number 1-100>}
No explanation, no other text.`;

/**
 * Build a concise user prompt from nutrition data.
 */
function buildUserPrompt(nutrition) {
  const parts = [];
  if (nutrition.breakfast && nutrition.breakfast.trim()) {
    parts.push(`Breakfast: ${nutrition.breakfast.trim()}`);
  }
  if (nutrition.lunch && nutrition.lunch.trim()) {
    parts.push(`Lunch: ${nutrition.lunch.trim()}`);
  }
  if (nutrition.dinner && nutrition.dinner.trim()) {
    parts.push(`Dinner: ${nutrition.dinner.trim()}`);
  }
  if (nutrition.snacks && nutrition.snacks.trim()) {
    parts.push(`Snacks: ${nutrition.snacks.trim()}`);
  }
  if (nutrition.drinks && nutrition.drinks.trim()) {
    parts.push(`Drinks: ${nutrition.drinks.trim()}`);
  }

  if (parts.length === 0) return null;
  return `Rate this athlete's daily nutrition:\n${parts.join('\n')}`;
}

/**
 * Compute nutrition health score (1-100) using AI.
 * Falls back to a simple heuristic if the API call fails.
 */
async function computeHealthScore(nutrition) {
  if (!nutrition) return null;

  const userPrompt = buildUserPrompt(nutrition);
  if (!userPrompt) return null;

  try {
    const openai = getClient();
    const response = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 30,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);

    const text = (response.choices[0]?.message?.content || '').trim();
    const parsed = JSON.parse(text);
    const score = Number(parsed.score);

    if (Number.isFinite(score) && score >= 1 && score <= 100) {
      return Math.round(score);
    }
  } catch (err) {
    // Silent fallback — don't let scoring failures break analytics
    console.error('Nutrition scoring failed, using fallback:', err.message);
  }

  // Fallback: simple heuristic if AI fails
  return computeFallbackScore(nutrition);
}

/**
 * Simple fallback scorer (used only when AI is unavailable).
 */
function computeFallbackScore(nutrition) {
  let score = 40;
  const fields = [nutrition.breakfast, nutrition.lunch, nutrition.dinner, nutrition.snacks, nutrition.drinks];
  const filled = fields.filter(f => f && f.trim()).length;
  score += filled * 5;
  // Cap at 65 for fallback since we can't analyze content
  return Math.min(65, Math.max(1, score));
}

module.exports = { computeHealthScore };
