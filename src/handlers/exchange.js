import { InlineKeyboard } from 'grammy';
import { bot, mainMenu } from '../bot.js';
import * as db from '../services/supabase.js';

const exchangeState = new Map();

bot.callbackQuery('exchange', async (ctx) => {
  await ctx.answerCallbackQuery();
  const accounts = await db.getAccounts();
  const kb = new InlineKeyboard();
  for (const acc of accounts) {
    kb.text(`${acc.name} (${acc.currency})`, `exch_from:${acc.id}`).row();
  }
  kb.text('<< Back', 'main_menu');
  await ctx.editMessageText('Exchange FROM which account?', { reply_markup: kb });
});

bot.callbackQuery(/^exch_from:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const fromId = ctx.match[1];
  exchangeState.set(ctx.chat.id, { step: 'to', fromAccountId: fromId });

  const accounts = await db.getAccounts();
  const kb = new InlineKeyboard();
  for (const acc of accounts) {
    if (acc.id !== fromId) {
      kb.text(`${acc.name} (${acc.currency})`, `exch_to:${acc.id}`).row();
    }
  }
  kb.text('<< Back', 'main_menu');
  await ctx.editMessageText('Exchange TO which account?', { reply_markup: kb });
});

bot.callbackQuery(/^exch_to:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const state = exchangeState.get(ctx.chat.id);
  state.toAccountId = ctx.match[1];
  state.step = 'amount_in';
  await ctx.editMessageText('Enter amount to exchange FROM:');
});

bot.on('message:text', async (ctx, next) => {
  const state = exchangeState.get(ctx.chat.id);
  if (!state) return next();

  const text = ctx.message.text.trim();

  if (state.step === 'amount_in') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('Invalid amount. Try again.');
    }
    state.amountIn = amount;
    state.step = 'amount_out';
    return ctx.reply('Enter amount you RECEIVE:');
  }

  if (state.step === 'amount_out') {
    const amountOut = parseFloat(text);
    if (isNaN(amountOut) || amountOut <= 0) {
      return ctx.reply('Invalid amount. Try again.');
    }

    const rate = amountOut / state.amountIn;
    const accounts = await db.getAccounts();
    const fromAcc = accounts.find(a => a.id === state.fromAccountId);
    const toAcc = accounts.find(a => a.id === state.toAccountId);

    await db.createExchange(state.fromAccountId, state.toAccountId, state.amountIn, amountOut, rate);
    await db.upsertRate(fromAcc.currency, toAcc.currency, rate);

    exchangeState.delete(ctx.chat.id);
    return ctx.reply(
      `Exchanged ${state.amountIn} ${fromAcc.currency} → ${amountOut} ${toAcc.currency} (rate: ${rate.toFixed(4)})`,
      { reply_markup: mainMenu() }
    );
  }

  return next();
});
