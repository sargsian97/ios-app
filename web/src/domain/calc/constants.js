/* Все коэффициенты и пороги расчётов — только здесь.
   Каждый блок — временное значение, уточнится в части 2 спецификации.
   Опубликованные формулы (Миффлин — Сан Жеор, Каннингем, e1RM из раздела 2.4, Этуотер) тоже лежат здесь,
   чтобы часть 2 могла заменить их без правки самих функций.
   Единицы: кг, см, ккал, дни. */

function freeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(freeze);
    Object.freeze(o);
  }
  return o;
}

/* ── Тренд веса ──
   Временное значение, уточнится в части 2 спецификации. */
export const TREND_V1_ALPHA = 0.1;             // v1: доля нового взвешивания в EMA (0 < α ≤ 1)
export const TREND_V2_OUTLIER_HALF_WINDOW = 3; // v2: ± дней вокруг точки для медианы и MAD (окно 7 дней)
export const TREND_V2_OUTLIER_K = 3.5;         // v2: выброс, если |вес − медиана| > K × σ
export const TREND_V2_SIGMA_MIN = 0.5;         // v2: нижняя граница σ, кг — ровная неделя не делает выбросом обычное колебание
export const TREND_V2_OUTLIER_MIN_POINTS = 3;  // v2: меньше точек в окне — выбросы не ищем
export const TREND_V2_SMOOTH_HALF_WIDTH = 7;   // v2: ± дней окна локальной линейной регрессии (ядро tricube)
export const MAD_TO_SIGMA = 1.4826;            // MAD → σ для нормального распределения (стандартная статистика)

/* ── Темп веса и прогноз даты цели ──
   Временное значение, уточнится в части 2 спецификации. */
export const WEIGHT_RATE_DAYS = 14;            // темп считаем по тренду за последние N дней
export const WEIGHT_RATE_MIN_DAYS = 7;         // меньше дней с трендом в окне — темп неизвестен (null)
export const FORECAST_FLAT_KG_PER_WEEK = 0.05; // темп меньше этого (по модулю) — вес стоит, даты нет
export const FORECAST_MAX_DAYS = 3650;         // прогноз дальше 10 лет не показываем (null)

/* ── BMR ──
   Временное значение, уточнится в части 2 спецификации.
   Коэффициенты — из опубликованных формул. */
export const MIFFLIN = freeze({                // Миффлин — Сан Жеор: 10·кг + 6,25·см − 5·лет + s
  weight: 10,
  height: 6.25,
  age: 5,
  male: 5,
  female: -161
});
export const CUNNINGHAM = freeze({             // Каннингем: 500 + 22 · безжировая масса, кг
  base: 500,
  perKgLean: 22
});

/* ── Стартовый и адаптивный расход (TDEE) ──
   Временное значение, уточнится в части 2 спецификации. */
export const ACTIVITY_FACTORS = freeze({       // BMR × коэффициент активности вне спорта
  sedentary: 1.2,                              // < 5 000 шагов
  moderate: 1.55,                              // 5 000–15 000 шагов
  very_active: 1.725                           // > 15 000 шагов
});
export const KCAL_PER_KG_TISSUE = 7700;        // энергоплотность изменения массы тела, ккал/кг
export const TDEE_FIRST_UPDATE_DAY = 3;        // первое обновление оценки — на 3-й день программы
export const TDEE_WINDOW_DAYS = 14;            // скользящее окно энергобаланса, дней
export const TDEE_SMOOTHING = 0.1;             // доля новой сырой оценки в сглаженной (EMA по дням)
export const TDEE_HOLD_NO_WEIGHIN_DAYS = 7;    // нет взвешивания за столько дней — hold
export const TDEE_MIN_INTAKE_DAYS = 3;         // минимум дней с едой в окне, иначе hold
export const TDEE_MIN_INTAKE_SHARE = 0.5;      // и не меньше этой доли дней окна
export const TDEE_RAW_MIN = 800;               // сырая оценка за день обрезается снизу, ккал
export const TDEE_RAW_MAX = 6000;              // и сверху, ккал (защита от скачков воды)

/* ── Калории и макросы ──
   Временное значение, уточнится в части 2 спецификации. */
export const KCAL_PER_G = freeze({             // коэффициенты Этуотера
  protein: 4,
  fat: 9,
  carbs: 4
});
export const CALORIE_FLOOR = freeze({          // нижний порог калорий по полу, ккал
  standard: { male: 1500, female: 1200 },
  low: { male: 1200, female: 1000 }
});
export const PROTEIN_USE_LEAN_MASS = true;     // если известна безжировая масса — белок считаем от неё
export const PROTEIN_G_PER_KG = freeze({       // белок, г на кг
  body: { low: 1.2, moderate: 1.6, high: 2.0, very_high: 2.4 }, // от массы тела
  lean: { low: 1.5, moderate: 2.0, high: 2.5, very_high: 3.0 }  // от безжировой массы
});
export const KETO_CARBS_MAX_G = 30;            // кето: потолок углеводов, г в день
export const DIET_TYPES = freeze({             // доли калорий: fat — жиры от всех ккал; carbs — для пропорции жиры:углеводы
  balanced: { fat: 0.30, carbs: 0.45 },
  low_fat: { fat: 0.20, carbs: 0.55 },
  low_carb: { fat: 0.45, carbs: 0.20 },
  keto: { fat: 0.70, carbs: 0.05, carbsMaxG: KETO_CARBS_MAX_G }
});
export const HIGH_DAY_SHARE = 0.2;             // день с повышенной калорийностью на 20 % больше обычного

/* ── Микронутриенты ──
   Временное значение, уточнится в части 2 спецификации.
   Цель — RDA/AI, потолок — UL из сводных таблиц DRI (NASEM, калий и натрий — пересмотр 2019 г.).
   Возрастные группы: 14–18, 19–30, 31–50, 51–70, 71+ (массив из 5 чисел).
   Беременность и лактация (p, l): 14–18, 19–30, 31–50 (массив из 3 чисел или одно число).
   m — мужчины, f — женщины, all — все; нет p/l — как у женщин того же возраста; нет значения — null. */
export const MICRO_AGE_BANDS = freeze([14, 19, 31, 51, 71]); // нижние границы групп, лет
export const MICRO_MIN_SHARE = 0.8;            // минимум = цель × доля (грубо, около EAR ≈ RDA / 1,2)
export const MICRO_KCAL_LIMITS = freeze({      // потолок как доля калорий (DGA 2020–2025, не DRI); только если известны ккал
  saturated_fat: { share: 0.10, kcalPerG: 9 },
  added_sugar: { share: 0.10, kcalPerG: 4 }
});
export const MICRO_DRI = freeze({
  fiber: { target: { m: [38, 38, 38, 30, 30], f: [26, 25, 25, 21, 21], p: 28, l: 29 } },        // г
  omega3: { target: { m: 1.6, f: 1.1, p: 1.4, l: 1.3 } },                                       // г, AI для АЛК
  omega6: { target: { m: [16, 17, 17, 14, 14], f: [11, 12, 12, 11, 11], p: 13, l: 13 } },      // г, AI для линолевой
  vitamin_a: {                                                                                  // мкг RAE
    target: { m: 900, f: 700, p: [750, 770, 770], l: [1200, 1300, 1300] },
    max: [2800, 3000, 3000, 3000, 3000]
  },
  vitamin_c: {                                                                                  // мг
    target: { m: [75, 90, 90, 90, 90], f: [65, 75, 75, 75, 75], p: [80, 85, 85], l: [115, 120, 120] },
    max: [1800, 2000, 2000, 2000, 2000]
  },
  vitamin_d: { target: { all: [15, 15, 15, 15, 20], p: 15, l: 15 }, max: 100 },                // мкг
  vitamin_e: { target: { all: 15, l: 19 }, max: [800, 1000, 1000, 1000, 1000] },               // мг; UL — для добавок
  vitamin_k: { target: { m: [75, 120, 120, 120, 120], f: [75, 90, 90, 90, 90] } },             // мкг
  b1: { target: { m: 1.2, f: [1.0, 1.1, 1.1, 1.1, 1.1], p: 1.4, l: 1.4 } },                    // мг
  b2: { target: { m: 1.3, f: [1.0, 1.1, 1.1, 1.1, 1.1], p: 1.4, l: 1.6 } },                    // мг
  b3: { target: { m: 16, f: 14, p: 18, l: 17 }, max: [30, 35, 35, 35, 35] },                   // мг NE; UL — для добавок и обогащённых
  b5: { target: { all: 5, p: 6, l: 7 } },                                                       // мг
  b6: { target: { m: [1.3, 1.3, 1.3, 1.7, 1.7], f: [1.2, 1.3, 1.3, 1.5, 1.5], p: 1.9, l: 2.0 }, max: [80, 100, 100, 100, 100] }, // мг
  b12: { target: { all: 2.4, p: 2.6, l: 2.8 } },                                                // мкг
  folate: { target: { all: 400, p: 600, l: 500 }, max: [800, 1000, 1000, 1000, 1000] },        // мкг DFE; UL — для фолиевой кислоты
  choline: { target: { m: 550, f: [400, 425, 425, 425, 425], p: 450, l: 550 }, max: [3000, 3500, 3500, 3500, 3500] }, // мг
  calcium: {                                                                                    // мг
    target: { m: [1300, 1000, 1000, 1000, 1200], f: [1300, 1000, 1000, 1200, 1200], p: [1300, 1000, 1000], l: [1300, 1000, 1000] },
    max: [3000, 2500, 2500, 2000, 2000]
  },
  iron: { target: { m: [11, 8, 8, 8, 8], f: [15, 18, 18, 8, 8], p: 27, l: [10, 9, 9] }, max: 45 }, // мг
  magnesium: { target: { m: [410, 400, 420, 420, 420], f: [360, 310, 320, 320, 320], p: [400, 350, 360], l: [360, 310, 320] } }, // мг; UL 350 только для добавок — потолок не ставим
  phosphorus: { target: { all: [1250, 700, 700, 700, 700] }, max: { all: [4000, 4000, 4000, 4000, 3000], p: 3500, l: 4000 } }, // мг
  potassium: { target: { m: [3000, 3400, 3400, 3400, 3400], f: [2300, 2600, 2600, 2600, 2600], p: [2600, 2900, 2900], l: [2500, 2800, 2800] } }, // мг
  sodium: { target: 1500, max: 2300 },                                                          // мг; потолок — CDRR
  zinc: { target: { m: 11, f: [9, 8, 8, 8, 8], p: [12, 11, 11], l: [13, 12, 12] }, max: [34, 40, 40, 40, 40] }, // мг
  copper: { target: { all: [0.89, 0.9, 0.9, 0.9, 0.9], p: 1.0, l: 1.3 }, max: [8, 10, 10, 10, 10] }, // мг
  manganese: { target: { m: [2.2, 2.3, 2.3, 2.3, 2.3], f: [1.6, 1.8, 1.8, 1.8, 1.8], p: 2.0, l: 2.6 }, max: [9, 11, 11, 11, 11] }, // мг
  selenium: { target: { all: 55, p: 60, l: 70 }, max: 400 },                                   // мкг
  water: { target: { m: [3300, 3700, 3700, 3700, 3700], f: [2300, 2700, 2700, 2700, 2700], p: 3000, l: 3800 } }, // мл, вся вода (с едой)
  caffeine: { max: { all: 400, p: 200, l: 200 } },                                              // мг; не DRI (FDA, ACOG)
  alcohol: { max: { m: 28, f: 14, p: 0, l: 0 } }                                                // г; не DRI (DGA: 2 / 1 порция по 14 г)
});

/* ── e1RM и прогрессия ──
   Временное значение, уточнится в части 2 спецификации. */
export const E1RM_V1_DIVISOR = 30;             // e1RM = вес × (1 + (повторы + RIR) / 30), раздел 2.4
export const FATIGUE_PER_SET = 0.025;          // поправка на усталость: доля цели за каждый прошлый подход в сессии
export const FATIGUE_MAX_SHARE = 0.2;          // но не больше этой доли
export const DEFAULT_TARGET_RIR = 2;           // RIR, если программа его не задала
export const DEFAULT_WEIGHT_STEP = 2.5;        // шаг весов, если зал не задан, кг
export const DEFAULT_BAR_WEIGHT = 20;          // гриф по умолчанию, кг

/* ── Разминка ──
   Временное значение, уточнится в части 2 спецификации. */
export const WARMUP_MIN_WORKING_WEIGHT = 30;   // рабочий вес меньше — разминку не строим, кг
export const WARMUP_SCHEMES = freeze({         // доля рабочего веса и повторы
  default: [{ pct: 0.4, reps: 8 }, { pct: 0.6, reps: 5 }, { pct: 0.8, reps: 3 }],
  short: [{ pct: 0.5, reps: 6 }, { pct: 0.75, reps: 3 }],
  long: [{ pct: 0.4, reps: 8 }, { pct: 0.55, reps: 5 }, { pct: 0.7, reps: 3 }, { pct: 0.85, reps: 1 }]
});

/* ── Объём по мышцам ──
   Временное значение, уточнится в части 2 спецификации. */
export const SECONDARY_MUSCLE_FACTOR = 0.5;    // подход засчитывается вторичной мышце с этим весом

/* ── Процент жира по формулам и отношения обхватов ──
   Временное значение, уточнится в части 2 спецификации.
   Опубликованные формулы: Deurenberg (1991), CUN-BAE (Gómez-Ambrosi 2012), RFM (Woolcott 2018), US Navy (Hodgdon 1984).
   Рост, талия, шея, бёдра — в см. */
export const BODY_FAT = freeze({
  deurenberg: { bmi: 1.2, age: 0.23, male: -10.8, base: -5.4 },
  cunBae: { base: -44.988, age: 0.503, female: 10.689, bmi: 3.172, bmi2: -0.026, bmiFemale: 0.181, bmiAge: -0.02, bmi2Female: -0.005, bmi2Age: 0.00021 },
  rfm: { male: 64, female: 76, k: 20 },
  navy: {
    male: { a: 1.0324, waistNeck: 0.19077, height: 0.15456 },
    female: { a: 1.29579, waistHipNeck: 0.35004, height: 0.221 },
    num: 495, sub: 450
  },
  validMin: 2,                                 // оценки вне 2–60 % отбрасываем как неправдоподобные
  validMax: 60
});

/* ── Менструальный цикл ──
   Временное значение, уточнится в части 2 спецификации. */
export const CYCLE_DEFAULT_LENGTH = 28;        // длина цикла, пока нет двух полных циклов, дни
export const CYCLE_PERIOD_GAP_DAYS = 2;        // разрыв больше — уже новые месячные
export const CYCLE_HISTORY = 6;                // среднее по последним N циклам
export const CYCLE_MIN_LENGTH = 15;            // короче или длиннее — не учитываем в среднем (вероятно, пропуск записей)
export const CYCLE_MAX_LENGTH = 60;

/* ── Цель: варианты темпа в мастере ──
   Временное значение, уточнится в части 2 спецификации. */
export const GOAL_RATES = freeze({             // % массы тела в неделю
  lose: [0.25, 0.5, 0.75, 1.0],
  gain: [0.1, 0.25, 0.5]
});
export const GOAL_RATE_DEFAULT = freeze({ lose: 0.5, gain: 0.25, maintain: 0 });
