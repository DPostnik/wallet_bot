import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() {
      this.messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({
            total: 6.48,
            currency: 'PLN',
            category: 'Groceries',
            items: [
              { name: 'Mleko', amount: 3.49 },
              { name: 'Chleb', amount: 2.99 },
            ],
          })}],
        }),
      };
    }
  },
}));

vi.mock('../../src/config.js', () => ({
  ANTHROPIC_API_KEY: 'test-key',
}));

const { categorizeReceipt } = await import('../../src/services/claude.js');

describe('categorizeReceipt', () => {
  it('returns structured data from receipt text', async () => {
    const result = await categorizeReceipt('Biedronka\nMleko 3.49\nChleb 2.99\nSuma 6.48');
    expect(result.total).toBe(6.48);
    expect(result.currency).toBe('PLN');
    expect(result.category).toBe('Groceries');
    expect(result.items).toHaveLength(2);
  });
});
