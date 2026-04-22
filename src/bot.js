import { Bot, InlineKeyboard } from 'grammy';
import { BOT_TOKEN, TELEGRAM_USER_ID } from './config.js';

export const bot = new Bot(BOT_TOKEN);

// Auth guard — only allow the owner
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== TELEGRAM_USER_ID) return;
  await next();
});

// Main menu keyboard
export function mainMenu() {
  return new InlineKeyboard()
    .text('Balances', 'balances').row()
    .text('Deposit', 'deposit').text('Withdraw', 'withdraw').row()
    .text('Exchange', 'exchange').row()
    .text('History', 'history').row()
    .text('Accounts', 'accounts');
}

// /start command
bot.command('start', async (ctx) => {
  await ctx.reply('Wallet Bot', { reply_markup: mainMenu() });
});
