import cors from 'cors';
app.use(cors({ origin: true, credentials: true }));
app.post('/paid', (req, res) => {
  if (req.headers['x-payment']) { return res.json({ data: 'secret' }); }
});
