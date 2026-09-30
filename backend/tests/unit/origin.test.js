import { frontendOrigins } from '../../src/config/env.js';
import { sameOrigin } from '../../src/middleware/auth.js';

test('local frontend permits only loopback aliases on the configured protocol and port', () => {
  expect([...frontendOrigins('http://localhost:5173/')].sort()).toEqual([
    'http://127.0.0.1:5173', 'http://[::1]:5173', 'http://localhost:5173',
  ].sort());
  expect(frontendOrigins('http://127.0.0.1:8080').has('http://localhost:8080')).toBe(true);
});
test('deployed frontend does not gain loopback or subdomain trust', () => {
  expect([...frontendOrigins('https://shop.example/')]).toEqual(['https://shop.example']);
});
test('origin guard rejects missing, null, lookalike, different-port and different-protocol origins', () => {
  for (const origin of [undefined, 'null', 'https://evil.example', 'http://localhost.evil.example:5173', 'http://localhost:5174', 'https://localhost:5173']) {
    expect(() => sameOrigin({ headers: { origin } }, {}, () => {})).toThrow('Request origin is not allowed.');
  }
  let called = false;
  sameOrigin({ headers: { origin: 'http://127.0.0.1:5173' } }, {}, () => { called = true; });
  expect(called).toBe(true);
});
