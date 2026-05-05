import 'dotenv/config';
import { poly } from './poly-agent.js';

console.log('[test] starting poly agent test');

const result = await poly.stream('what is sol price?');
console.log('[test] stream result:', typeof result);
console.log('[test] stream keys:', Object.keys(result));

let count = 0;
console.log('[test] iterating textStream...');
for await (const text of result.textStream) {
  count++;
  console.log(`[test] chunk ${count}:`, JSON.stringify(text.slice(0, 50)));
}

console.log('[test] total chunks:', count);
console.log('[test] usage:', await result.usage);
