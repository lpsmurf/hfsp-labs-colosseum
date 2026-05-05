import 'dotenv/config';
import { poly } from './poly-agent.js';

console.log('[debug] streaming from poly agent');
const stream = await poly.stream('What is SOL price?');

console.log('[debug] stream.textStream:', typeof stream.textStream);
console.log('[debug] stream has Symbol.asyncIterator:', Symbol.asyncIterator in stream.textStream);

let fullText = '';
let chunkCount = 0;
try {
  for await (const chunk of stream.textStream) {
    chunkCount++;
    console.log(`[debug] chunk #${chunkCount}: type=${typeof chunk}, len=${chunk?.length}, value=${JSON.stringify(chunk?.slice(0, 30))}`);
    fullText += chunk;
  }
} catch (err) {
  console.error('[debug] error during streaming:', err);
}

console.log('[debug] final: chunkCount=', chunkCount, 'fullTextLen=', fullText.length);
console.log('[debug] fullText:', fullText.slice(0, 100));
