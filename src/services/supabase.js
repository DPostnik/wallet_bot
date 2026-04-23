import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Accounts ---

export async function createAccount(name, currency) {
  const { data, error } = await supabase.from('accounts').insert({ name, currency }).select().single();
  if (error) throw error;
  return data;
}

export async function getAccounts() {
  const { data, error } = await supabase.from('accounts').select('*');
  if (error) throw error;
  return data;
}

export async function deleteAccount(id) {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
}

// --- Transactions ---

export async function addTransaction(accountId, type, amount, { category, description, imageUrl, exchangeId } = {}) {
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

export async function getTransactions(accountId, limit = 20) {
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

export async function getBalance(accountId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount')
    .eq('account_id', accountId);
  if (error) throw error;

  const raw = data.reduce((sum, tx) => {
    return tx.type === 'deposit' ? sum + Number(tx.amount) : sum - Number(tx.amount);
  }, 0);
  return Math.round(raw * 100) / 100;
}

// --- Exchanges ---

export async function createExchange(fromAccountId, toAccountId, amountIn, amountOut, rate) {
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

export async function upsertRate(fromCurrency, toCurrency, rate) {
  const { error } = await supabase
    .from('rates')
    .upsert(
      { from_currency: fromCurrency, to_currency: toCurrency, rate, updated_at: new Date().toISOString() },
      { onConflict: 'from_currency,to_currency' }
    );
  if (error) throw error;
}

export async function getRate(fromCurrency, toCurrency) {
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

export async function uploadImage(fileName, buffer) {
  const { data, error } = await supabase.storage.from('receipts').upload(fileName, buffer, {
    contentType: 'image/jpeg',
  });
  if (error) throw error;

  const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(data.path);
  return urlData.publicUrl;
}
