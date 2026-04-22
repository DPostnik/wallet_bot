import { InlineKeyboard } from 'grammy';
import { bot, mainMenu } from '../bot.js';
import * as db from '../services/supabase.js';

bot.callbackQuery('history', async (ctx) => {
  await ctx.answerCallbackQuery();
  const accounts = await db.getAccounts();
  const kb = new InlineKeyboard();
  for (const acc of accounts) {
    kb.text(`${acc.name} (${acc.currency})`, `hist_acc:${acc.id}`).row();
  }
  kb.text('<< Back', 'main_menu');
  await ctx.editMessageText('View history for which account?', { reply_markup: kb });
});

bot.callbackQuery(/^hist_acc:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const accountId = ctx.match[1];
  const transactions = await db.getTransactions(accountId);
  const accounts = await db.getAccounts();
  const acc = accounts.find(a => a.id === accountId);

  if (transactions.length === 0) {
    const kb = new InlineKeyboard().text('<< Back', 'history');
    return ctx.editMessageText(`No transactions for ${acc.name}.`, { reply_markup: kb });
  }

  let text = `<b>${acc.name} — Last ${transactions.length} transactions:</b>\n\n`;
  for (const tx of transactions) {
    const sign = tx.type === 'deposit' ? '+' : '-';
    const date = new Date(tx.created_at).toLocaleDateString();
    const cat = tx.category ? ` [${tx.category}]` : '';
    const desc = tx.description ? ` — ${tx.description.substring(0, 40)}` : '';
    text += `${date} ${sign}${tx.amount} ${acc.currency}${cat}${desc}\n`;
  }

  const kb = new InlineKeyboard().text('<< Back', 'history');
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
});
