// Entry point: initializes Express app, loads middleware and routes
require('dotenv').config();
const express = require('express');
const limiter = require('./src/middleware/rateLimit');
const submitRoute = require('./src/routes/submit');
const authRoute = require('./src/routes/auth');
const { requireAuth } = require('./src/middleware/auth');
const supabase = require('./src/services/supabase');
const { getSubmissionsByUser } = require('./src/services/supabase');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://redacao-ia-frontend.vercel.app',
    'https://notaapp.com.br'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(limiter);

app.use('/auth', authRoute);
app.use('/submit', submitRoute);

app.get('/submissions', requireAuth, async (req, res) => {
  try {
    const submissions = await getSubmissionsByUser(req.user.id);
    return res.json(submissions);
  } catch (err) {
    console.error('Erro ao buscar submissões:', err);
    return res.status(500).json({ error: 'Erro ao buscar histórico de redações.' });
  }
});

app.get('/submissions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Submissão não encontrada.' });
    }

    return res.json(data);
  } catch (err) {
    console.error('Erro ao buscar submissão:', err);
    return res.status(500).json({ error: 'Erro ao buscar submissão.' });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
