/* JSON-схемы ответов ИИ. С ключом API они уходят как structured output (web/ai.js),
   в артефакте claude.ai (возможность sample) — текстом в конце запроса. */

const NUM = { type: 'number' };

export const SCHEMAS = Object.freeze({
  nutrition: {
    type: 'object',
    properties: { kcal: NUM, p: NUM, f: NUM, c: NUM, fib: NUM, pa: NUM, pv: NUM, note: { type: 'string' } },
    required: ['kcal', 'p', 'f', 'c', 'fib', 'pa', 'pv', 'note'],
    additionalProperties: false
  },
  photo: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' }, grams: NUM, kcal: NUM, p: NUM, f: NUM, c: NUM, fib: NUM, pa: NUM, pv: NUM,
            src: { type: 'string', enum: ['estimate', 'label'] }, note: { type: 'string' }
          },
          required: ['name', 'grams', 'kcal', 'p', 'f', 'c', 'fib', 'pa', 'pv', 'src', 'note'],
          additionalProperties: false
        }
      },
      note: { type: 'string' }
    },
    required: ['items', 'note'],
    additionalProperties: false
  }
});

/* Запрос + схема ответа текстом (для вызовов без structured output) */
export function withSchema(prompt, schemaName) {
  const s = schemaName && SCHEMAS[schemaName];
  if (!s) return String(prompt);
  return String(prompt) + '\n\nОтвет — один JSON-объект строго по этой JSON Schema, без пояснений и без Markdown:\n' + JSON.stringify(s);
}
