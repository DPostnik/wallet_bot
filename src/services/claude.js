import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '../config.js';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const CATEGORIES = [
  'Groceries', 'Household', 'Office', 'Gardening', 'Transport',
  'Subscriptions', 'Dining', 'Health', 'Clothing', 'Entertainment', 'Other',
];

export async function categorizeReceipt(receiptText) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are a receipt parser. Extract the total, currency, category, and itemized list from this receipt text.

Categories (pick one): ${CATEGORIES.join(', ')}

Receipt text:
${receiptText}

Respond ONLY with valid JSON in this format:
{
  "total": <number>,
  "currency": "<USD|USDT|PLN>",
  "category": "<category>",
  "items": [{"name": "<item>", "amount": <number>}]
}`,
    }],
  });

  const text = response.content[0].text;
  return JSON.parse(text);
}
