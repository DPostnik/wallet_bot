import { InlineKeyboard } from 'grammy';
import { bot, mainMenu } from '../bot.js';
import * as db from '../services/supabase.js';

const awaitingWithdraw = new Map();

bot.callbackQuery('withdraw', async (ctx) => {
  await ctx.answerCallbackQuery();
  const accounts = await db.getAccounts();
  const kb = new InlineKeyboard();
  for (const acc of accounts) {
    kb.text(`${acc.name} (${acc.currency})`, `wdr_acc:${acc.id}`).row();
  }
  kb.text('<< Back', 'main_menu');
  await ctx.editMessageText('Withdraw from which account?', { reply_markup: kb });
});

bot.callbackQuery(/^wdr_acc:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  awaitingWithdraw.set(ctx.chat.id, ctx.match[1]);
  await ctx.editMessageText('Enter withdrawal amount:');
});

bot.on('message:text', async (ctx, next) => {
  const accountId = awaitingWithdraw.get(ctx.chat.id);
  if (!accountId) return next();

  awaitingWithdraw.delete(ctx.chat.id);
  const amount = parseFloat(ctx.message.text);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Invalid amount. Try again.', { reply_markup: mainMenu() });
  }

  await db.addTransaction(accountId, 'withdrawal', amount);
  const balance = await db.getBalance(accountId);
  const accounts = await db.getAccounts();
  const acc = accounts.find(a => a.id === accountId);
  await ctx.reply(`Withdrew ${amount} ${acc.currency}. Balance: ${balance} ${acc.currency}`, { reply_markup: mainMenu() });
});
