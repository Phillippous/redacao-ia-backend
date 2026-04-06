/*
  Run the following SQL in the Supabase SQL editor before using this service:

  CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    tema TEXT NOT NULL,
    redacao TEXT NOT NULL,
    c1 INTEGER NOT NULL,
    c2 INTEGER NOT NULL,
    c3 INTEGER NOT NULL,
    c4 INTEGER NOT NULL,
    c5 INTEGER NOT NULL,
    nota_total INTEGER NOT NULL,
    resultado JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Users can insert own submissions"
    ON submissions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can read own submissions"
    ON submissions FOR SELECT
    USING (auth.uid() = user_id);
*/

// Service for initializing and exporting the Supabase client
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

if (!supabase) {
  console.warn('Supabase credentials not set — database persistence disabled.');
}

async function saveSubmission({ user_id, tema, redacao, resultado, nota_total }) {
  const { c1, c2, c3, c4, c5 } = resultado.competencias;
  const { data, error } = await supabase
    .from('submissions')
    .insert({
      user_id,
      tema,
      redacao,
      c1: c1.nota,
      c2: c2.nota,
      c3: c3.nota,
      c4: c4.nota,
      c5: c5.nota,
      nota_total,
      resultado,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getSubmissionsByUser(user_id) {
  const { data, error } = await supabase
    .from('submissions')
    .select('id, tema, nota_total, c1, c2, c3, c4, c5, created_at')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

module.exports = supabase;
module.exports.saveSubmission = saveSubmission;
module.exports.getSubmissionsByUser = getSubmissionsByUser;
