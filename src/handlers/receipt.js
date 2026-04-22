import { InlineKeyboard } from 'grammy';
import { bot, mainMenu } from '../bot.js';
import * as db from '../services/supabase.js';
import { extractText } from '../services/ocr.js';
import { categorizeReceipt } from '../services/claude.js';

// Pending receipts: chatId -> { total, currency, category, items, imageUrl }
const pendingReceipt = new Map();

// Handle photo messages
bot.on('message:photo', async (ctx) => {
  await ctx.reply('Processing receipt...');

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1]; // highest resolution
    const file = await ctx.api.getFile(photo.file_id);
    const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    // Download image
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Upload to Supabase Storage
    const fileName = `${Date.now()}_${photo.file_id}.jpg`;
    const imageUrl = await db.uploadImage(fileName, buffer);

    // OCR
    const text = await extractText(buffer);
    if (!text || text.trim().length < 5) {
      return ctx.reply('Could not read text from this image. Try a clearer photo.', { reply_markup: mainMenu() });
    }

    // Claude categorization
    const result = await categorizeReceipt(text);

    // Store pending receipt
    pendingReceipt.set(ctx.chat.id, {
      total: result.total,
      currency: result.currency,
      category: result.category,
      items: result.items,
      imageUrl,
    });

    // Ask which account to save to
    const accounts = await db.getAccounts();
    const itemsSummary = result.items.map(i => `  ${i.name}: ${i.amount}`).join('\n');
    const kb = new InlineKeyboard();
    for (const acc of accounts) {
      kb.text(`${acc.name} (${acc.currency})`, `rcpt_save:${acc.id}`).row();
    }
    kb.text('Cancel', 'rcpt_cancel');

    await ctx.reply(
      `Found: ${result.total} ${result.currency} — ${result.category}\n\nItems:\n${itemsSummary}\n\nSave to which account?`,
      { reply_markup: kb }
    );
  } catch (err) {
    console.error('Receipt processing error:', err);
    await ctx.reply('Failed to process receipt. Try again.', { reply_markup: mainMenu() });
  }
});

bot.callbackQuery(/^rcpt_save:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const accountId = ctx.match[1];
  const receipt = pendingReceipt.get(ctx.chat.id);
  if (!receipt) return ctx.editMessageText('Receipt expired. Upload again.');

  pendingReceipt.delete(ctx.chat.id);

  const description = receipt.items.map(i => `${i.name}: ${i.amount}`).join(', ');
  await db.addTransaction(accountId, 'withdrawal', receipt.total, {
    category: receipt.category,
    description,
    imageUrl: receipt.imageUrl,
  });

  const balance = await db.getBalance(accountId);
  const accounts = await db.getAccounts();
  const acc = accounts.find(a => a.id === accountId);

  await ctx.editMessageText(
    `Saved: -${receipt.total} ${receipt.currency} [${receipt.category}]\nNew balance: ${balance} ${acc.currency}`,
    { reply_markup: mainMenu() }
  );
});

bot.callbackQuery('rcpt_cancel', async (ctx) => {
  await ctx.answerCallbackQuery();
  pendingReceipt.delete(ctx.chat.id);
  await ctx.editMessageText('Receipt cancelled.', { reply_markup: mainMenu() });
});
