# VULN-013 — Biased Modulo Reduces Entropy of `generateApiKey()`

**Risk Level:** LOW  
**Status:** Detected  
**Component:** `packages/weave-link/src/auth.ts`  
**Function:** `generateApiKey()`

---

## Description

`generateApiKey()` maps CSPRNG bytes to an alphabet using the modulo operator:

```typescript
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; // 62 chars
const bytes = new Uint8Array(length);
crypto.getRandomValues(bytes);
return Array.from(bytes, b => chars[b % chars.length]).join('');
```

`b` is uniformly distributed over `[0, 255]`. Since `256 % 62 = 8`, the
first 8 characters of the alphabet (`ABCDEFGH`) are marginally more likely
to be selected than the remaining 54. This is a **modulo bias**.

For a 32-character key the concrete impact is negligible (the bias is ~3%
per character, reducing effective entropy from ~190 bits to ~188 bits), but
the pattern can propagate to shorter keys or future uses where the alphabet
is larger (e.g., 64-char Base64url = 64 chars → `256 % 64 = 0` → no bias).

---

## Impact

- Marginally non-uniform key distribution — very minor practical impact at
  current key length.
- Establishes a pattern that could become exploitable if key length is reduced.

---

## Remediation

### Immediate Action
Use `crypto.randomBytes` with rejection sampling OR the built-in
`crypto.getRandomValues` with a power-of-two alphabet:

**Option A — rejection sampling (most correct):**
```typescript
export function generateApiKey(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const maxUnbiased = 256 - (256 % chars.length); // 248 for 62-char alphabet
  let result = '';
  while (result.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < maxUnbiased && result.length < length) {
        result += chars[b % chars.length];
      }
    }
  }
  return result;
}
```

**Option B — use `crypto.randomUUID()` as the key** (convenient, no bias):
```typescript
export function generateApiKey(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
```

---

## Verification

Generate 100,000 keys. Assert that character frequency distribution does not
deviate from expected uniform distribution by more than 0.5%.
