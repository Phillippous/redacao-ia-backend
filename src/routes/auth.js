const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json({ message: 'Cadastro realizado. Verifique seu email.' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return res.status(401).json({ error: 'Email ou senha incorretos.' });
  return res.status(200).json({
    access_token: data.session.access_token,
    user: { id: data.user.id, email: data.user.email },
  });
});

module.exports = router;
