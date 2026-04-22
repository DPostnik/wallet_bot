import { describe, it, expect, vi } from 'vitest';

const mockFrom = vi.fn();
const mockStorage = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mockFrom,
    storage: { from: mockStorage },
  }),
}));

vi.mock('../../src/config', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_KEY: 'test-key',
}));

const db = await import('../../src/services/supabase.js');

describe('accounts', () => {
  it('createAccount calls insert with name and currency', async () => {
    const insertFn = vi.fn().mockReturnValue({ data: { id: '1', name: 'Cash', currency: 'PLN' }, error: null });
    const selectFn = vi.fn().mockReturnValue({ single: insertFn });
    mockFrom.mockReturnValue({ insert: vi.fn().mockReturnValue({ select: selectFn }) });

    const result = await db.createAccount('Cash', 'PLN');
    expect(mockFrom).toHaveBeenCalledWith('accounts');
    expect(result).toEqual({ id: '1', name: 'Cash', currency: 'PLN' });
  });

  it('getAccounts returns all accounts', async () => {
    const selectFn = vi.fn().mockReturnValue({ data: [{ id: '1', name: 'Cash', currency: 'PLN' }], error: null });
    mockFrom.mockReturnValue({ select: selectFn });

    const result = await db.getAccounts();
    expect(result).toHaveLength(1);
  });
});

describe('getBalance', () => {
  it('computes balance as deposits minus withdrawals', async () => {
    const selectFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        data: [
          { type: 'deposit', amount: 1000 },
          { type: 'withdrawal', amount: 300 },
          { type: 'deposit', amount: 500 },
        ],
        error: null,
      }),
    });
    mockFrom.mockReturnValue({ select: selectFn });

    const result = await db.getBalance('account-1');
    expect(result).toBe(1200);
  });
});
