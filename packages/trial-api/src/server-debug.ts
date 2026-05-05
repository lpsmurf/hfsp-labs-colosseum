import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { poly } from './poly-agent.js';

const app = express();
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  console.log('[chat] start');
  
  const ChatSchema = z.object({
    message: z.string().min(1).max(1000),
    sessionId: z.string().min(1).max(64),
  });

  const parse = ChatSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  let closed = false;
  req.on('close', () => { closed = true; console.log('[chat] request closed'); });

  try {
    console.log('[chat] calling poly.stream with:', parse.data.message);
    const stream = await poly.stream(parse.data.message);
    console.log('[chat] got stream, textStream type:', typeof stream.textStream);

    let text = '';
    let count = 0;
    console.log('[chat] starting iteration...');
    for await (const chunk of stream.textStream) {
      count++;
      console.log(`[chat] chunk #${count}: type=${typeof chunk}, len=${chunk?.length}, value=${JSON.stringify(chunk?.slice(0, 30))}, closed=${closed}`);
      if (closed) {
        console.log('[chat] stopping - request closed');
        break;
      }
      text += chunk;
      send('delta', { text: chunk });
    }

    console.log('[chat] done iterating, total chunks:', count, 'text length:', text.length);

    if (!text) {
      console.log('[chat] text is empty, sending error');
      send('error', { message: 'No response' });
      res.end();
      return;
    }

    send('done', { remaining: 5 });
    res.end();
  } catch (err) {
    console.error('[err]', err);
    if (!res.writableEnded) {
      send('error', { message: 'Agent error' });
      res.end();
    }
  }
});

app.listen(8787, () => console.log('listening on :8787'));
