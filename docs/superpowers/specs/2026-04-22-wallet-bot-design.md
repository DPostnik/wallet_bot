# Wallet Bot — Design Spec

Personal finance Telegram bot for tracking money across multiple accounts and currencies.

## Problem

The user has money spread across multiple places (personal bank, cash, crypto, sister's company, home country) in multiple currencies (USD, USDT, PLN). There is no unified view of total wealth, spending breakdown, or transaction history.

## Solution

A Telegram bot that serves as a personal financial dashboard. The user interacts via inline buttons and image uploads. All data is stored in Supabase. Receipt images are processed with OCR and categorized by Claude.

## Accounts

Each account represents a place where money is held:

- **Personal PLN** — bank account in Poland
- **Cash** — physical cash (can have multiple: Cash PLN, Cash USD)
- **Crypto** — USDT, USD holdings
- **Sister's company** — user's money held by sister, with deductions for purchases she makes on user's behalf
- **Home country assets** — money/assets held in another country

Accounts are user-managed (create, edit, delete). Each has a name and currency.

## Data Model

### accounts
| Column     | Type      | Description                  |
|------------|-----------|------------------------------|
| id         | uuid      | Primary key                  |
| name       | text      | Display name                 |
| currency   | text      | USD, USDT, or PLN            |
| created_at | timestamp | Creation date                |
| updated_at | timestamp | Last update                  |

### transactions
| Column      | Type      | Description                        |
|-------------|-----------|-------------------------------------|
| id          | uuid      | Primary key                        |
| account_id  | uuid      | FK to accounts                     |
| type        | text      | deposit or withdrawal              |
| amount      | numeric   | Positive number                    |
| category    | text      | Auto-assigned by Claude (nullable) |
| description | text      | Note or OCR-extracted text         |
| image_url   | text      | Receipt image in Supabase Storage  |
| exchange_id | uuid      | FK to exchanges (nullable)         |
| created_at  | timestamp | Transaction date                   |

Transaction currency always matches its account's currency (no separate currency column).

### exchanges
| Column          | Type      | Description              |
|-----------------|-----------|--------------------------|
| id              | uuid      | Primary key              |
| from_account_id | uuid      | FK to accounts           |
| to_account_id   | uuid      | FK to accounts           |
| amount_in       | numeric   | Amount taken from source |
| amount_out      | numeric   | Amount added to target   |
| rate            | numeric   | Manual exchange rate     |
| created_at      | timestamp | Exchange date            |

### rates
| Column     | Type      | Description                             |
|------------|-----------|------------------------------------------|
| id         | uuid      | Primary key                             |
| from_currency | text   | Source currency (e.g., PLN)             |
| to_currency   | text   | Target currency (e.g., USD)             |
| rate       | numeric   | Conversion rate                         |
| updated_at | timestamp | When this rate was last set              |

Stores the latest manual exchange rate per currency pair. Updated whenever the user performs an exchange or sets a rate manually. Used by the balance view to convert totals to USD. If no rate exists for a pair, that account's balance is shown unconverted with a "no rate" note.

### How balances are computed

Account balance = sum of deposits - sum of withdrawals.

Exchange operations create two transaction rows linked by `exchange_id`: a withdrawal on the source account and a deposit on the target account. This keeps balance computation simple — just deposits minus withdrawals.

"Deductions" (e.g., sister buying subscriptions on user's behalf) are recorded as withdrawals with a descriptive category/note. No separate type needed.

## Bot Interface

### Main Menu (inline buttons)
- **Balances** — all accounts with current balances + total converted to USD
- **Deposit** — pick account, enter amount
- **Withdraw** — pick account, enter amount
- **Exchange** — pick source account, pick target account, enter amounts and rate
- **Upload receipt** — send image for OCR + categorization
- **History** — pick account, view recent transactions
- **Accounts** — add, edit, delete accounts

### Receipt Upload Flow
1. User sends a photo to the bot
2. Bot responds: "Processing receipt..."
3. Tesseract.js extracts text from the image
4. Extracted text is sent to Claude API for categorization
5. Claude returns structured JSON: total amount, currency, category, and itemized breakdown
6. Bot shows the result: "Found: 150 PLN — Groceries (3 items). Save to which account?"
7. User picks an account via inline button
8. One transaction is saved with the total amount. Itemized breakdown is stored in the description field. Image is stored in Supabase Storage.

Multi-item receipts are saved as a single transaction with the total. The per-item details go into the description for reference.

### Spending Categories
Claude assigns one of: Groceries, Household, Office, Gardening, Transport, Subscriptions, Dining, Health, Clothing, Entertainment, Other.

The category list can be extended later. Claude picks the best fit; if unclear, defaults to "Other."

## OCR Strategy

**Primary: Tesseract.js** — free, runs in-process, no external API needed.

If accuracy proves insufficient (especially on Polish-language receipts), swap to Google Cloud Vision (1,000 images/month free). The OCR layer is abstracted behind a simple interface (image in, text out) to make swapping easy.

## Claude API Usage

- **Purpose:** Categorize receipt items from OCR text
- **Input:** Raw OCR text from receipt
- **Output:** JSON array of items with amount, currency, and category
- **Token estimate:** ~200-300 tokens per receipt (~$0.01-0.02 per receipt)
- **SDK:** `@anthropic-ai/sdk`

## Currency Conversion

- Exchange rates are entered manually by the user
- The "total balance" view converts everything to USD using the last known rate for each currency pair
- No auto-fetching of rates from external APIs

## Tech Stack

| Component  | Choice                          |
|------------|----------------------------------|
| Runtime    | Node.js (plain JavaScript)       |
| Bot framework | grammy                       |
| Database   | Supabase (Postgres + Storage)    |
| OCR        | Tesseract.js                     |
| AI         | Claude API (@anthropic-ai/sdk)   |
| Hosting    | Railway free tier                |

## Project Structure

```
wallet/
├── src/
│   ├── bot.js              — bot setup, command handlers, menus
│   ├── handlers/
│   │   ├── balance.js      — balance view handler
│   │   ├── deposit.js      — deposit flow
│   │   ├── withdraw.js     — withdrawal flow
│   │   ├── exchange.js     — exchange flow
│   │   ├── receipt.js      — receipt upload + OCR + categorization
│   │   ├── history.js      — transaction history
│   │   └── accounts.js     — account management
│   ├── services/
│   │   ├── ocr.js          — Tesseract.js wrapper
│   │   ├── claude.js       — Claude API for categorization
│   │   └── supabase.js     — DB queries + image storage
│   └── config.js           — env vars, constants
├── .env
└── package.json
```

## Security

The bot is personal (single-user). Access is restricted by checking `ctx.from.id` against a `TELEGRAM_USER_ID` environment variable. Messages from other users are silently ignored.

## OCR Note: Tesseract.js on Railway

Tesseract.js loads ~15MB language data and is CPU-intensive. Railway free tier has limited resources. Polish language data (`pol`) must be explicitly loaded. If performance is poor, switch to Google Cloud Vision free tier (1,000 images/month).

## Out of Scope

- No auto-sync with banks or exchanges
- No automatic exchange rate fetching
- No reminders or notifications
- No multi-user support
- No TypeScript
- No spending analytics beyond category breakdown
