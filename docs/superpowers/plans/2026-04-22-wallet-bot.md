# Wallet Bot Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal Telegram bot that tracks money across multiple accounts and currencies, with receipt OCR and Claude-powered categorization.

**Architecture:** Single Node.js process running a grammy Telegram bot. Supabase for persistence (Postgres + file storage). Tesseract.js for OCR, Claude API for categorization. All interactions via inline buttons and photo uploads.

**Tech Stack:** Node.js (plain JS), grammy, @supabase/supabase-js, tesseract.js, @anthropic-ai/sdk

---

## File Structure

```
wallet/
├── src/
│   ├── bot.js              — grammy bot setup, auth guard, main menu, photo handler
│   ├── config.js            — env vars: BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_API_KEY, TELEGRAM_USER_ID
│   ├── handlers/
│   │   ├── accounts.js      — create/edit/delete accounts, account list
│   │   ├── balance.js       — show all account balances + USD total
│   │   ├── deposit.js       — deposit conversation flow
│   │   ├── withdraw.js      — withdrawal conversation flow
│   │   ├── exchange.js      — exchange conversation flow (two accounts + rate)
│   │   ├── history.js       — transaction history per account
│   │   └── receipt.js       — receipt photo processing: OCR → Claude → save
│   ├── services/
│   │   ├── supabase.js      — DB client, queries for accounts/transactions/exchanges/rates, image upload
│   │   ├── ocr.js           — Tesseract.js wrapper (image buffer → text)
│   │   └── claude.js        — Claude API call: receipt text → {total, currency, category, items}
│   └── index.js             — entry point: imports bot, calls bot.start()
├── tests/
│   ├── services/
│   │   ├── supabase.test.js
│   │   ├── ocr.test.js
│   │   └── claude.test.js
│   └── .gitkeep
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql — DDL for accounts, transactions, exchanges, rates
├── .env.example
├── .gitignore
└── package.json
```

---

## Task 1: Project Scaffold & Dependencies

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/config.js`
- Create: `src/index.js`

- [ ] **Step 1: Initialize npm project**

```bash
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install grammy @supabase/supabase-js @anthropic-ai/sdk tesseract.js dotenv
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install --save-dev vitest
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
.env
```

- [ ] **Step 5: Create `.env.example`**

```
BOT_TOKEN=
# Use the service-role key (not anon key) — RLS is enabled with no policies
SUPABASE_URL=
SUPABASE_KEY=
ANTHROPIC_API_KEY=
TELEGRAM_USER_ID=
```

- [ ] **Step 6: Create `src/config.js`**

```js
require('dotenv').config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  TELEGRAM_USER_ID: Number(process.env.TELEGRAM_USER_ID),
};
```

- [ ] **Step 7: Create `src/index.js`** (minimal — just starts the bot)

```js
const { bot } = require('./bot');

bot.start();
console.log('Wallet bot is running');
```

- [ ] **Step 8: Add scripts to `package.json`**

Add to `scripts`:
```json
{
  "start": "node src/index.js",
  "test": "vitest run"
}
```

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example src/config.js src/index.js
git commit -m "feat: scaffold project with dependencies and config"
```

---

## Task 2: Database Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- accounts
create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null check (currency in ('USD', 'USDT', 'PLN')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- exchanges (must exist before transactions references it)
create table exchanges (
  id uuid primary key default gen_random_uuid(),
  from_account_id uuid not null references accounts(id),
  to_account_id uuid not null references accounts(id),
  amount_in numeric not null check (amount_in > 0),
  amount_out numeric not null check (amount_out > 0),
  rate numeric not null check (rate > 0),
  created_at timestamptz default now()
);

-- transactions
create table transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  type text not null check (type in ('deposit', 'withdrawal')),
  amount numeric not null check (amount > 0),
  category text,
  description text,
  image_url text,
  exchange_id uuid references exchanges(id),
  created_at timestamptz default now()
);

-- rates
create table rates (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null,
  to_currency text not null,
  rate numeric not null check (rate > 0),
  updated_at timestamptz default now(),
  unique(from_currency, to_currency)
);

-- Enable RLS (Supabase default, but we use service key so it's bypassed)
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table exchanges enable row level security;
alter table rates enable row level security;
```

- [ ] **Step 2: Run migration in Supabase**

Go to Supabase dashboard → SQL Editor → paste and run `001_initial_schema.sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: add database schema migration"
```

---

## Task 3: Supabase Service Layer

**Files:**
- Create: `src/services/supabase.js`
- Create: `tests/services/supabase.test.js`

- [ ] **Step 1: Write tests for account CRUD**

```js
// tests/services/supabase.test.js
const { describe, it, expect, vi } = require('vitest');

// We mock the Supabase client to test our service functions in isolation
const mockFrom = vi.fn();
const mockStorage = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mockFrom,
    storage: { from: mockStorage },
  }),
}));

// Must import after mock setup
const db = require('../../src/services/supabase');

describe('accounts', () => {
  it('createAccount calls insert with name and currency', async () => {
    const insertFn = vi.fn().mockReturnValue({ data: { id: '1', name: 'Cash', currency: 'PLN' }, error: null });
    const selectFn = vi.fn().mockReturnValue({ single: insertFn });
    mockFrom.mockReturnValue({ insert: vi.fn().mockReturnValue({ select: selectFn }) });

    const result = await db.createAccount('Cash', 'PLN');
    expect(mockFrom).toHaveBeenCalledWith('accounts');
    expect(result).toEqual({ id: '1', name: 'Cash', currency: 'PLN' });
  });

  it('getAccounts returns all accounts', async () => {
    const selectFn = vi.fn().mockReturnValue({ data: [{ id: '1', name: 'Cash', currency: 'PLN' }], error: null });
    mockFrom.mockReturnValue({ select: selectFn });

    const result = await db.getAccounts();
    expect(result).toHaveLength(1);
  });
});

describe('getBalance', () => {
  it('computes balance as deposits minus withdrawals', async () => {
    const selectFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        data: [
          { type: 'deposit', amount: 1000 },
          { type: 'withdrawal', amount: 300 },
          { type: 'deposit', amount: 500 },
        ],
        error: null,
      }),
    });
    mockFrom.mockReturnValue({ select: selectFn });

    const result = await db.getBalance('account-1');
    expect(result).toBe(1200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/supabase.test.js
```

Expected: FAIL — `supabase.js` does not exist yet.

- [ ] **Step 3: Implement `src/services/supabase.js`**

```js
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_KEY } = require('../config');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Accounts ---

async function createAccount(name, currency) {
  const { data, error } = await supabase.from('accounts').insert({ name, currency }).select().single();
  if (error) throw error;
  return data;
}

async function getAccounts() {
  const { data, error } = await supabase.from('accounts').select('*');
  if (error) throw error;
  return data;
}

async function deleteAccount(id) {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
}

// --- Transactions ---

async function addTransaction(accountId, type, amount, { category, description, imageUrl, exchangeId } = {}) {
  const { data, error } = await supabase.from('transactions').insert({
    account_id: accountId,
    type,
    amount,
    category: category || null,
    description: description || null,
    image_url: imageUrl || null,
    exchange_id: exchangeId || null,
  }).select().single();
  if (error) throw error;
  return data;
}

async function getTransactions(accountId, limit = 20) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// --- Balance ---

async function getBalance(accountId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount')
    .eq('account_id', accountId);
  if (error) throw error;

  return data.reduce((sum, tx) => {
    return tx.type === 'deposit' ? sum + Number(tx.amount) : sum - Number(tx.amount);
  }, 0);
}

// --- Exchanges ---

async function createExchange(fromAccountId, toAccountId, amountIn, amountOut, rate) {
  const { data: exchange, error } = await supabase
    .from('exchanges')
    .insert({ from_account_id: fromAccountId, to_account_id: toAccountId, amount_in: amountIn, amount_out: amountOut, rate })
    .select()
    .single();
  if (error) throw error;

  await addTransaction(fromAccountId, 'withdrawal', amountIn, { exchangeId: exchange.id });
  await addTransaction(toAccountId, 'deposit', amountOut, { exchangeId: exchange.id });

  return exchange;
}

// --- Rates ---

async function upsertRate(fromCurrency, toCurrency, rate) {
  const { error } = await supabase
    .from('rates')
    .upsert(
      { from_currency: fromCurrency, to_currency: toCurrency, rate, updated_at: new Date().toISOString() },
      { onConflict: 'from_currency,to_currency' }
    );
  if (error) throw error;
}

async function getRate(fromCurrency, toCurrency) {
  const { data, error } = await supabase
    .from('rates')
    .select('rate')
    .eq('from_currency', fromCurrency)
    .eq('to_currency', toCurrency)
    .single();
  if (error) return null;
  return Number(data.rate);
}

// --- Image Upload ---

async function uploadImage(fileName, buffer) {
  const { data, error } = await supabase.storage.from('receipts').upload(fileName, buffer, {
    contentType: 'image/jpeg',
  });
  if (error) throw error;

  const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(data.path);
  return urlData.publicUrl;
}

module.exports = {
  createAccount,
  getAccounts,
  deleteAccount,
  addTransaction,
  getTransactions,
  getBalance,
  createExchange,
  upsertRate,
  getRate,
  uploadImage,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/supabase.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/supabase.js tests/services/supabase.test.js
git commit -m "feat: add supabase service layer with account, transaction, exchange, rate queries"
```

---

## Task 4: OCR Service

**Files:**
- Create: `src/services/ocr.js`
- Create: `tests/services/ocr.test.js`

- [ ] **Step 1: Write test for OCR service**

```js
// tests/services/ocr.test.js
const { describe, it, expect, vi } = require('vitest');

vi.mock('tesseract.js', () => ({
  createWorker: () => ({
    recognize: vi.fn().mockResolvedValue({
      data: { text: 'Biedronka\nMleko 3.49\nChleb 2.99\nSuma 6.48' },
    }),
    terminate: vi.fn(),
  }),
}));

const { extractText } = require('../../src/services/ocr');

describe('extractText', () => {
  it('returns text from image buffer', async () => {
    const buffer = Buffer.from('fake-image');
    const text = await extractText(buffer);
    expect(text).toContain('Biedronka');
    expect(text).toContain('6.48');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/ocr.test.js
```

Expected: FAIL — `ocr.js` does not exist.

- [ ] **Step 3: Implement `src/services/ocr.js`**

```js
const { createWorker } = require('tesseract.js');

async function extractText(imageBuffer) {
  const worker = await createWorker('pol+eng');
  const { data: { text } } = await worker.recognize(imageBuffer);
  await worker.terminate();
  return text;
}

module.exports = { extractText };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/services/ocr.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ocr.js tests/services/ocr.test.js
git commit -m "feat: add Tesseract.js OCR wrapper with Polish+English support"
```

---

## Task 5: Claude Categorization Service

**Files:**
- Create: `src/services/claude.js`
- Create: `tests/services/claude.test.js`

- [ ] **Step 1: Write test for Claude service**

```js
// tests/services/claude.test.js
const { describe, it, expect, vi } = require('vitest');

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      constructor() {
        this.messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: JSON.stringify({
              total: 6.48,
              currency: 'PLN',
              category: 'Groceries',
              items: [
                { name: 'Mleko', amount: 3.49 },
                { name: 'Chleb', amount: 2.99 },
              ],
            })}],
          }),
        };
      }
    },
  };
});

const { categorizeReceipt } = require('../../src/services/claude');

describe('categorizeReceipt', () => {
  it('returns structured data from receipt text', async () => {
    const result = await categorizeReceipt('Biedronka\nMleko 3.49\nChleb 2.99\nSuma 6.48');
    expect(result.total).toBe(6.48);
    expect(result.currency).toBe('PLN');
    expect(result.category).toBe('Groceries');
    expect(result.items).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/claude.test.js
```

Expected: FAIL — `claude.js` does not exist.

- [ ] **Step 3: Implement `src/services/claude.js`**

```js
const Anthropic = require('@anthropic-ai/sdk').default;
const { ANTHROPIC_API_KEY } = require('../config');

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const CATEGORIES = [
  'Groceries', 'Household', 'Office', 'Gardening', 'Transport',
  'Subscriptions', 'Dining', 'Health', 'Clothing', 'Entertainment', 'Other',
];

async function categorizeReceipt(receiptText) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are a receipt parser. Extract the total, currency, category, and itemized list from this receipt text.

Categories (pick one): ${CATEGORIES.join(', ')}

Receipt text:
${receiptText}

Respond ONLY with valid JSON in this format:
{
  "total": <number>,
  "currency": "<USD|USDT|PLN>",
  "category": "<category>",
  "items": [{"name": "<item>", "amount": <number>}]
}`,
    }],
  });

  const text = response.content[0].text;
  return JSON.parse(text);
}

module.exports = { categorizeReceipt };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/services/claude.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/claude.js tests/services/claude.test.js
git commit -m "feat: add Claude receipt categorization service"
```

---

## Task 6: Bot Setup & Auth Guard

**Files:**
- Create: `src/bot.js`

- [ ] **Step 1: Create `src/bot.js` with grammy setup and auth middleware**

```js
const { Bot, InlineKeyboard } = require('grammy');
const { BOT_TOKEN, TELEGRAM_USER_ID } = require('./config');

const bot = new Bot(BOT_TOKEN);

// Auth guard — only allow the owner
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== TELEGRAM_USER_ID) return;
  await next();
});

// Main menu keyboard
function mainMenu() {
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

// Register handlers — order matters for text input routing.
// Handlers with message:text listeners must call next() when their state doesn't match.
// Photo handler first (no text conflict), then text handlers, then callback-only handlers.
// Handlers are required here but implemented in later tasks.
// Uncomment each line as you complete the corresponding task.
// require('./handlers/receipt');
// require('./handlers/exchange');
// require('./handlers/deposit');
// require('./handlers/withdraw');
// require('./handlers/accounts');
// require('./handlers/balance');
// require('./handlers/history');

module.exports = { bot, mainMenu };
```

As you complete each handler task (Tasks 7-12), uncomment the corresponding `require` line in `bot.js`.

- [ ] **Step 2: Verify bot starts without errors**

Set up `.env` with your real `BOT_TOKEN` and `TELEGRAM_USER_ID`. Then:

```bash
node src/index.js
```

Send `/start` in Telegram. Verify you see the menu. Press Ctrl+C to stop.

- [ ] **Step 3: Commit**

```bash
git add src/bot.js
git commit -m "feat: add bot setup with auth guard and main menu"
```

---

## Task 7: Account Management Handler

**Files:**
- Create: `src/handlers/accounts.js`

- [ ] **Step 1: Implement account management handler**

```js
const { InlineKeyboard } = require('grammy');
const { bot, mainMenu } = require('../bot');
const db = require('../services/supabase');

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
const awaitingName = new Map(); // chatId -> currency

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
```

- [ ] **Step 2: Uncomment `require('./handlers/accounts')` in `src/bot.js`**

- [ ] **Step 3: Test manually in Telegram**

Start the bot, tap Accounts, add an account, verify it shows up, delete it.

- [ ] **Step 4: Commit**

```bash
git add src/handlers/accounts.js src/bot.js
git commit -m "feat: add account management (create, view, delete)"
```

---

## Task 8: Deposit & Withdraw Handlers

**Files:**
- Create: `src/handlers/deposit.js`
- Create: `src/handlers/withdraw.js`

- [ ] **Step 1: Implement deposit handler**

```js
// src/handlers/deposit.js
const { InlineKeyboard } = require('grammy');
const { bot, mainMenu } = require('../bot');
const db = require('../services/supabase');

const awaitingDeposit = new Map(); // chatId -> accountId

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
```

- [ ] **Step 2: Implement withdraw handler**

```js
// src/handlers/withdraw.js
const { InlineKeyboard } = require('grammy');
const { bot, mainMenu } = require('../bot');
const db = require('../services/supabase');

const awaitingWithdraw = new Map(); // chatId -> accountId

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
```

- [ ] **Step 3: Uncomment `require('./handlers/deposit')` and `require('./handlers/withdraw')` in `src/bot.js`**

- [ ] **Step 4: Test manually in Telegram**

Deposit to an account, withdraw from it, verify balances change correctly.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/deposit.js src/handlers/withdraw.js src/bot.js
git commit -m "feat: add deposit and withdraw handlers"
```

---

## Task 9: Exchange Handler

**Files:**
- Create: `src/handlers/exchange.js`

- [ ] **Step 1: Implement exchange handler**

```js
// src/handlers/exchange.js
const { InlineKeyboard } = require('grammy');
const { bot, mainMenu } = require('../bot');
const db = require('../services/supabase');

// State machine: chatId -> { step, fromAccountId, toAccountId, amountIn }
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
```

- [ ] **Step 2: Uncomment `require('./handlers/exchange')` in `src/bot.js`**

- [ ] **Step 3: Test manually in Telegram**

Create two accounts with different currencies. Exchange between them. Verify both balances update and the rate is saved.

- [ ] **Step 4: Commit**

```bash
git add src/handlers/exchange.js src/bot.js
git commit -m "feat: add exchange handler with rate tracking"
```

---

## Task 10: Balance Handler

**Files:**
- Create: `src/handlers/balance.js`

- [ ] **Step 1: Implement balance handler**

```js
// src/handlers/balance.js
const { InlineKeyboard } = require('grammy');
const { bot, mainMenu } = require('../bot');
const db = require('../services/supabase');

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
```

- [ ] **Step 2: Uncomment `require('./handlers/balance')` in `src/bot.js`**

- [ ] **Step 3: Test manually**

Add accounts, deposit money, do an exchange to set a rate, verify balance view shows correct totals and "no rate" for unconverted currencies.

- [ ] **Step 4: Commit**

```bash
git add src/handlers/balance.js src/bot.js
git commit -m "feat: add balance view with USD total conversion"
```

---

## Task 11: Transaction History Handler

**Files:**
- Create: `src/handlers/history.js`

- [ ] **Step 1: Implement history handler**

```js
// src/handlers/history.js
const { InlineKeyboard } = require('grammy');
const { bot, mainMenu } = require('../bot');
const db = require('../services/supabase');

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
```

- [ ] **Step 2: Uncomment `require('./handlers/history')` in `src/bot.js`**

- [ ] **Step 3: Test manually**

Verify history shows deposits, withdrawals, exchanges with dates and categories.

- [ ] **Step 4: Commit**

```bash
git add src/handlers/history.js src/bot.js
git commit -m "feat: add transaction history view"
```

---

## Task 12: Receipt Upload Handler

**Files:**
- Create: `src/handlers/receipt.js`

- [ ] **Step 1: Implement receipt handler**

```js
// src/handlers/receipt.js
const { InlineKeyboard } = require('grammy');
const { bot, mainMenu } = require('../bot');
const db = require('../services/supabase');
const { extractText } = require('../services/ocr');
const { categorizeReceipt } = require('../services/claude');

// Pending receipts: chatId -> { total, currency, category, items, imageUrl }
const pendingReceipt = new Map();

// Handle photo messages
bot.on('message:photo', async (ctx) => {
  await ctx.reply('Processing receipt...');

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
```

- [ ] **Step 2: Uncomment `require('./handlers/receipt')` in `src/bot.js`**

- [ ] **Step 3: Test manually**

Send a photo of a receipt to the bot. Verify OCR + Claude categorization + save flow works end-to-end.

- [ ] **Step 4: Commit**

```bash
git add src/handlers/receipt.js src/bot.js
git commit -m "feat: add receipt upload with OCR and Claude categorization"
```

---

## Task 13: Create Supabase Storage Bucket

This is a manual step in the Supabase dashboard.

- [ ] **Step 1: Create storage bucket**

Go to Supabase dashboard → Storage → Create bucket named `receipts` → Set to public.

- [ ] **Step 2: Verify upload works**

Upload a receipt photo in the bot and confirm the image URL is accessible.

---

## Task 14: Railway Deployment

- [ ] **Step 1: Create `Procfile`**

```
web: node src/index.js
```

- [ ] **Step 2: Commit**

```bash
git add Procfile
git commit -m "feat: add Procfile for Railway deployment"
```

- [ ] **Step 3: Deploy to Railway**

1. Push to GitHub
2. Connect repo in Railway dashboard
3. Add env vars: `BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY`, `ANTHROPIC_API_KEY`, `TELEGRAM_USER_ID`
4. Deploy

- [ ] **Step 4: Verify bot works in production**

Send `/start`, run through all flows.
