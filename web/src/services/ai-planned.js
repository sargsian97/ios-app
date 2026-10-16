/* ИИ-функции, отложенные до отдельного решения (промпт к спецификации): только интерфейсы.
   Когда их включат — реализовать здесь с теми же сигнатурами и лимитами (config.js, usage.js).

   describeFood(store, text, opts)      → { items: [{ name, grams, per100, note }], note }   — еда по описанию текстом
   importRecipeFromUrl(store, url, opts) → { name, servings, ingredients: [{ name, amount }], steps }
                                           (сначала разметка schema.org/Recipe на странице, иначе LLM)
   importRecipeFromPhoto(store, file, opts), describeRecipe(store, text, opts) — то же из фото и текста
   scanWeightStack(store, file, opts)    → { min, max, step, micro: [] }                       — стек тренажёра по фото
   generateProgram(store, answers, opts) → WorkoutProgram (спецификация, раздел 2.1) */

function planned(name) {
  return async () => { throw Object.assign(new Error(name + ': скоро'), { code: 'planned' }); };
}

export const PLANNED = Object.freeze(['describeFood', 'importRecipeFromUrl', 'importRecipeFromPhoto', 'describeRecipe', 'scanWeightStack', 'generateProgram']);
export const describeFood = planned('describeFood');
export const importRecipeFromUrl = planned('importRecipeFromUrl');
export const importRecipeFromPhoto = planned('importRecipeFromPhoto');
export const describeRecipe = planned('describeRecipe');
export const scanWeightStack = planned('scanWeightStack');
export const generateProgram = planned('generateProgram');
