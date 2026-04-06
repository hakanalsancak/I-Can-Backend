/**
 * Nutrition Health Scorer for Athletes
 * Analyzes meal text descriptions and returns a 1-100 health score.
 * 1 = extremely unhealthy, 100 = extremely healthy
 */

// Healthy foods — each match adds points
const HEALTHY_KEYWORDS = {
  // Lean proteins (high value for athletes)
  'chicken breast': 12, 'grilled chicken': 12, 'chicken': 8, 'turkey': 8,
  'salmon': 12, 'tuna': 10, 'fish': 9, 'shrimp': 8, 'cod': 8, 'tilapia': 8,
  'eggs': 7, 'egg whites': 9, 'tofu': 7, 'tempeh': 8,
  'lean beef': 8, 'steak': 6, 'lean meat': 8,
  'greek yogurt': 10, 'cottage cheese': 8, 'protein shake': 9, 'whey': 8,

  // Complex carbs
  'oatmeal': 10, 'oats': 10, 'brown rice': 9, 'quinoa': 10, 'sweet potato': 10,
  'whole wheat': 8, 'whole grain': 8, 'multigrain': 7, 'rice': 5,
  'pasta': 4, 'bread': 3,

  // Vegetables
  'broccoli': 10, 'spinach': 10, 'kale': 10, 'asparagus': 9,
  'salad': 8, 'vegetables': 8, 'veggies': 8, 'greens': 8,
  'avocado': 9, 'tomato': 7, 'cucumber': 7, 'peppers': 7, 'pepper': 7,
  'carrots': 7, 'beans': 8, 'lentils': 9, 'chickpeas': 8,
  'cauliflower': 8, 'zucchini': 7, 'mushrooms': 7, 'onion': 5,
  'peas': 7, 'corn': 5, 'celery': 6, 'cabbage': 7,

  // Fruits
  'berries': 9, 'blueberries': 9, 'strawberries': 8, 'banana': 7,
  'apple': 7, 'orange': 7, 'fruit': 6, 'fruits': 7, 'mango': 6,
  'grapes': 5, 'watermelon': 5, 'pineapple': 5, 'kiwi': 7,
  'acai': 8, 'pomegranate': 8,

  // Healthy fats
  'nuts': 8, 'almonds': 9, 'walnuts': 9, 'peanut butter': 6,
  'olive oil': 8, 'coconut oil': 5, 'seeds': 8, 'chia': 9, 'flax': 8,

  // Healthy drinks
  'water': 10, 'green tea': 9, 'herbal tea': 8, 'smoothie': 7,
  'protein shake': 9, 'milk': 5, 'almond milk': 7, 'oat milk': 6,
  'coconut water': 7, 'electrolytes': 8,

  // Healthy snacks
  'granola': 5, 'rice cakes': 6, 'hummus': 7, 'trail mix': 6,
  'yogurt': 7, 'dark chocolate': 4, 'protein bar': 6,

  // Cooking methods
  'grilled': 5, 'steamed': 6, 'baked': 4, 'roasted': 4, 'boiled': 4,
  'homemade': 5, 'home cooked': 5, 'meal prep': 6,
};

// Unhealthy foods — each match subtracts points
const UNHEALTHY_KEYWORDS = {
  // Fast food chains & items
  'mcdonald': -15, 'burger king': -15, 'kfc': -14, 'wendy': -13,
  'taco bell': -13, 'subway': -3, 'dominos': -12, 'papa john': -12,
  'fast food': -14, 'takeout': -5, 'takeaway': -5,

  // Junk food
  'chips': -12, 'crisps': -12, 'doritos': -14, 'cheetos': -14, 'lays': -12,
  'pringles': -12, 'nachos': -10,
  'candy': -14, 'gummy': -12, 'skittles': -13, 'haribo': -12,
  'chocolate bar': -10, 'snickers': -12, 'mars bar': -12, 'kit kat': -10,
  'cookies': -10, 'cookie': -10, 'cake': -10, 'pastry': -9, 'donut': -13,
  'doughnut': -13, 'muffin': -7, 'brownie': -10, 'cupcake': -11,
  'ice cream': -11, 'gelato': -8, 'sundae': -11,
  'croissant': -6, 'waffle': -5, 'pancake': -4,

  // Fried & processed
  'fried': -10, 'deep fried': -14, 'french fries': -12, 'fries': -11,
  'fried chicken': -10, 'nuggets': -10, 'chicken nuggets': -11,
  'hot dog': -12, 'corn dog': -12, 'processed': -8,
  'bacon': -6, 'sausage': -7, 'salami': -8, 'pepperoni': -8,
  'spam': -12, 'canned meat': -8,

  // Sugary drinks (very bad for athletes)
  'soda': -15, 'coke': -15, 'coca cola': -15, 'pepsi': -15,
  'fanta': -14, 'sprite': -14, 'mountain dew': -15, '7up': -14,
  'energy drink': -13, 'red bull': -13, 'monster': -13, 'gatorade': -4,
  'powerade': -4, 'lucozade': -6,
  'juice box': -8, 'fruit juice': -5, 'orange juice': -3,
  'milkshake': -10, 'frappuccino': -10, 'frappe': -9,
  'sweetened': -6, 'sugary': -8,

  // Alcohol
  'beer': -12, 'wine': -8, 'alcohol': -14, 'vodka': -15,
  'whiskey': -15, 'rum': -15, 'tequila': -15, 'cocktail': -12,
  'liquor': -15,

  // Fast carbs / refined
  'white bread': -6, 'white rice': -3, 'instant noodles': -11,
  'ramen': -8, 'cup noodle': -12, 'pot noodle': -12,
  'frozen pizza': -12, 'microwave meal': -10, 'tv dinner': -11,
  'frozen dinner': -10,

  // High-calorie unhealthy combos
  'pizza': -9, 'burger': -8, 'cheeseburger': -10, 'big mac': -14,
  'whopper': -14, 'wrap': -2, 'kebab': -5, 'doner': -8,

  // Sauces & condiments (mild penalties)
  'mayo': -4, 'mayonnaise': -4, 'ketchup': -3, 'bbq sauce': -3,
  'ranch': -5, 'cream cheese': -4, 'butter': -3, 'margarine': -5,
  'syrup': -6, 'nutella': -8, 'whipped cream': -6,
};

/**
 * Score a single text field (meal description).
 * Returns adjustment points (can be positive or negative).
 */
function scoreMealText(text) {
  if (!text || typeof text !== 'string') return 0;
  const lower = text.toLowerCase();
  let score = 0;
  const matched = new Set();

  // Check unhealthy first (longer phrases first to avoid partial matches)
  const unhealthySorted = Object.entries(UNHEALTHY_KEYWORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, points] of unhealthySorted) {
    if (lower.includes(keyword) && !matched.has(keyword)) {
      score += points;
      matched.add(keyword);
    }
  }

  // Check healthy (longer phrases first)
  const healthySorted = Object.entries(HEALTHY_KEYWORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, points] of healthySorted) {
    if (lower.includes(keyword) && !matched.has(keyword)) {
      score += points;
      matched.add(keyword);
    }
  }

  return score;
}

/**
 * Compute overall nutrition health score (1-100) from meal data.
 *
 * Scoring approach:
 *   Base score = 50 (neutral)
 *   + meal structure bonuses (having breakfast, all 3 meals, etc.)
 *   + food content analysis (healthy foods boost, junk food tanks)
 *   + athlete-specific bonuses (hydration, snacking smart)
 *
 * Clamped to 1-100.
 */
function computeHealthScore(nutrition) {
  if (!nutrition) return null;

  let score = 50; // neutral baseline

  const breakfast = (nutrition.breakfast || '').trim();
  const lunch = (nutrition.lunch || '').trim();
  const dinner = (nutrition.dinner || '').trim();
  const snacks = (nutrition.snacks || '').trim();
  const drinks = (nutrition.drinks || '').trim();

  const hasBreakfast = breakfast.length > 0;
  const hasLunch = lunch.length > 0;
  const hasDinner = dinner.length > 0;
  const hasSnacks = snacks.length > 0;
  const hasDrinks = drinks.length > 0;

  // Meal structure bonuses
  if (hasBreakfast) score += 5;  // breakfast is critical for athletes
  if (hasLunch) score += 3;
  if (hasDinner) score += 3;
  if (hasBreakfast && hasLunch && hasDinner) score += 4; // all 3 meals bonus

  // Analyze each meal's content
  score += scoreMealText(breakfast);
  score += scoreMealText(lunch);
  score += scoreMealText(dinner);
  score += scoreMealText(snacks);
  score += scoreMealText(drinks);

  // Hydration bonus — water specifically is huge for athletes
  if (hasDrinks) {
    const drinksLower = drinks.toLowerCase();
    if (drinksLower.includes('water')) score += 5;
  }

  // Clamp to 1-100
  return Math.max(1, Math.min(100, Math.round(score)));
}

module.exports = { computeHealthScore };
