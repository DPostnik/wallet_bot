import { bot } from './bot.js';

// Register handlers — order matters for text input routing
import './handlers/receipt.js';
import './handlers/exchange.js';
import './handlers/deposit.js';
import './handlers/withdraw.js';
import './handlers/accounts.js';
import './handlers/balance.js';
import './handlers/history.js';

bot.start();
console.log('Wallet bot is running');
