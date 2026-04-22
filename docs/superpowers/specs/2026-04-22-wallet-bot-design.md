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
| Column   | Type   | Description                  |
|----------|--------|------------------------------|
| id       | uuid   | Primary key                  |
| name     | text   | Display name                 |
| currency | text   | USD, USDT, or PLN            |
| created_at | timestamp | Creation date             |

### transactions
| Column      | Type   | Description                              |
|-------------|--------|------------------------------------------|
| id          | uuid   | Primary key                              |
| account_id  | uuid   | FK to accounts                           |
| type        | text   | deposit, withdrawal, exchange, deduction |
| amount      | numeric | Positive number                         |
| currency    | text   | Currency of the transaction              |
| category    | text   | Auto-assigned by Claude (nullable)       |
| description | text   | Note or OCR-extracted text               |
| image_url   | text   | Receipt image in Supabase Storage        |
| created_at  | timestamp | Transaction date                      |

### exchanges
| Column          | Type    | Description              |
|-----------------|---------|--------------------------|
| id              | uuid    | Primary key              |
| from_account_id | uuid    | FK to accounts           |
| to_account_id   | uuid    | FK to accounts           |
| amount_in       | numeric | Amount taken from source |
| amount_out      | numeric | Amount added to target   |
| rate            | numeric | Manual exchange rate     |
| created_at      | timestamp | Exchange date          |

Account balance is computed from transactions (sum of deposits minus sum of withdrawals/deductions) rather than stored directly. Exchange operations create a withdrawal on the source account and a deposit on the target account, linked via the exchanges table.

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
5. Claude returns structured JSON: items with amount, currency, category
6. Bot shows the result: "Found: 150 PLN — Groceries. Save to which account?"
7. User picks an account via inline button
8. Transaction is saved, image is stored in Supabase Storage

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

## Out of Scope

- No auto-sync with banks or exchanges
- No automatic exchange rate fetching
- No reminders or notifications
- No multi-user support
- No TypeScript
- No spending analytics beyond category breakdown
