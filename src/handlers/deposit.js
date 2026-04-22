import { InlineKeyboard } from 'grammy';
import { bot, mainMenu } from '../bot.js';
import * as db from '../services/supabase.js';

const awaitingDeposit = new Map();

bot.callbackQuery('deposit', async (ctx) => {
  await ctx.answerCallbackQuery();
  const accounts = await db.getAccounts();
  const kb = new InlineKeyboard();
  for (const acc of accounts) {
    kb.text(`${acc.name} (${acc.currency})`, `dep_acc:${acc.id}`).row();
  }
  kb.text('<< Back', 'main_menu');
  await ctx.editMessageText('Deposit to which account?', { reply_markup: kb });
});

bot.callbackQuery(/^dep_acc:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  awaitingDeposit.set(ctx.chat.id, ctx.match[1]);
  await ctx.editMessageText('Enter deposit amount:');
});

bot.on('message:text', async (ctx, next) => {
  const accountId = awaitingDeposit.get(ctx.chat.id);
  if (!accountId) return next();

  awaitingDeposit.delete(ctx.chat.id);
  const amount = parseFloat(ctx.message.text);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Invalid amount. Try again.', { reply_markup: mainMenu() });
  }

  await db.addTransaction(accountId, 'deposit', amount);
  const balance = await db.getBalance(accountId);
  const accounts = await db.getAccounts();
  const acc = accounts.find(a => a.id === accountId);
  await ctx.reply(`Deposited ${amount} ${acc.currency}. Balance: ${balance} ${acc.currency}`, { reply_markup: mainMenu() });
});
