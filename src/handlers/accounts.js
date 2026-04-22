import { InlineKeyboard } from 'grammy';
import { bot, mainMenu } from '../bot.js';
import * as db from '../services/supabase.js';

const CURRENCIES = ['USD', 'USDT', 'PLN'];

// "Accounts" button → show account list + "Add account" button
bot.callbackQuery('accounts', async (ctx) => {
  await ctx.answerCallbackQuery();
  const accounts = await db.getAccounts();

  const kb = new InlineKeyboard();
  for (const acc of accounts) {
    kb.text(`${acc.name} (${acc.currency})`, `acc_view:${acc.id}`).row();
  }
  kb.text('+ Add Account', 'acc_add').row();
  kb.text('<< Back', 'main_menu');

  await ctx.editMessageText('Your accounts:', { reply_markup: kb });
});

// View single account → option to delete
bot.callbackQuery(/^acc_view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const accountId = ctx.match[1];
  const accounts = await db.getAccounts();
  const acc = accounts.find(a => a.id === accountId);
  if (!acc) return ctx.editMessageText('Account not found.');

  const balance = await db.getBalance(accountId);
  const kb = new InlineKeyboard()
    .text('Delete', `acc_del:${accountId}`).row()
    .text('<< Back', 'accounts');

  await ctx.editMessageText(
    `${acc.name}\nCurrency: ${acc.currency}\nBalance: ${balance} ${acc.currency}`,
    { reply_markup: kb }
  );
});

// Delete account
bot.callbackQuery(/^acc_del:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const accountId = ctx.match[1];
  await db.deleteAccount(accountId);
  await ctx.editMessageText('Account deleted.', { reply_markup: new InlineKeyboard().text('<< Back', 'accounts') });
});

// Add account — step 1: pick currency
bot.callbackQuery('acc_add', async (ctx) => {
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard();
  for (const c of CURRENCIES) {
    kb.text(c, `acc_currency:${c}`);
  }
  await ctx.editMessageText('Pick currency for the new account:', { reply_markup: kb });
});

// Add account — step 2: ask for name
const awaitingName = new Map();

bot.callbackQuery(/^acc_currency:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const currency = ctx.match[1];
  awaitingName.set(ctx.chat.id, currency);
  await ctx.editMessageText(`Currency: ${currency}\nNow type the account name:`);
});

// Catch text input for account name
bot.on('message:text', async (ctx, next) => {
  const currency = awaitingName.get(ctx.chat.id);
  if (!currency) return next();

  awaitingName.delete(ctx.chat.id);
  const name = ctx.message.text.trim();
  const acc = await db.createAccount(name, currency);
  await ctx.reply(`Account "${acc.name}" (${acc.currency}) created!`, { reply_markup: mainMenu() });
});

// Back to main menu
bot.callbackQuery('main_menu', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('Wallet Bot', { reply_markup: mainMenu() });
});
