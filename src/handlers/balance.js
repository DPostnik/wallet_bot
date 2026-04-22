import { InlineKeyboard } from 'grammy';
import { bot, mainMenu } from '../bot.js';
import * as db from '../services/supabase.js';

bot.callbackQuery('balances', async (ctx) => {
  await ctx.answerCallbackQuery();
  const accounts = await db.getAccounts();

  let text = '<b>Balances:</b>\n\n';
  let totalUsd = 0;
  let allConverted = true;

  for (const acc of accounts) {
    const balance = await db.getBalance(acc.id);
    text += `${acc.name}: ${balance} ${acc.currency}\n`;

    if (acc.currency === 'USD' || acc.currency === 'USDT') {
      totalUsd += balance;
    } else {
      const rate = await db.getRate(acc.currency, 'USD');
      if (rate) {
        totalUsd += balance * rate;
      } else {
        allConverted = false;
        text += `  <i>(no USD rate set)</i>\n`;
      }
    }
  }

  text += `\n<b>Total (USD):</b> ${totalUsd.toFixed(2)}`;
  if (!allConverted) {
    text += '\n<i>Some accounts could not be converted — set exchange rates first.</i>';
  }

  const kb = new InlineKeyboard().text('<< Back', 'main_menu');
  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
});
