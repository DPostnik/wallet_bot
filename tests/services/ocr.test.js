import { describe, it, expect, vi } from 'vitest';

vi.mock('tesseract.js', () => ({
  createWorker: () => ({
    recognize: vi.fn().mockResolvedValue({
      data: { text: 'Biedronka\nMleko 3.49\nChleb 2.99\nSuma 6.48' },
    }),
    terminate: vi.fn(),
  }),
}));

const { extractText } = await import('../../src/services/ocr.js');

describe('extractText', () => {
  it('returns text from image buffer', async () => {
    const buffer = Buffer.from('fake-image');
    const text = await extractText(buffer);
    expect(text).toContain('Biedronka');
    expect(text).toContain('6.48');
  });
});
