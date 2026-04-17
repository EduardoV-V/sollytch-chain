'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase nao configurado');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

async function createUser(username, password, certificate) {
  if (!supabase) throw new Error('Supabase nao configurado');

  const passwordHash = await bcrypt.hash(password, 10);

  const { data: user, error } = await supabase
    .from('users')
    .insert({ username, password_hash: passwordHash })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const { error: certError } = await supabase
    .from('certificates')
    .insert({ user_id: user.id, certificate });

  if (certError) throw new Error(certError.message);

  return user;
}

async function getUserByUsername(username) {
  if (!supabase) throw new Error('Supabase nao configurado');

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .single();

  if (error) return null;
  return data;
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

async function getCertificateByUserId(userId) {
  if (!supabase) throw new Error('Supabase nao configurado');

  const { data, error } = await supabase
    .from('certificates')
    .select('certificate')
    .eq('user_id', userId)
    .single();

  if (error) throw new Error(error.message);
  return data.certificate;
}

module.exports = {
  supabase,
  createUser,
  getUserByUsername,
  verifyPassword,
  getCertificateByUserId
};