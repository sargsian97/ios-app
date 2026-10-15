/* Профиль: пол, дата рождения, рост, единицы, тема, язык, согласия (спецификация, раздел 3) */
import { model, f } from '../schema.js';
import { normalizeUnits, DEFAULT_UNITS } from '../../domain/units.js';

export const Profile = model({
  name: 'Profile',
  collection: 'profile',
  singleton: true,
  fields: {
    name: f.string({ def: '', max: 60 }),
    sex: f.enum(['male', 'female'], { nullable: true }),
    birthDate: f.date(),
    heightCm: f.number({ min: 50, max: 272 }),
    units: { def: () => ({ ...DEFAULT_UNITS }), normalize: normalizeUnits, validate: () => null },
    theme: f.enum(['system', 'light', 'dark']),
    lang: f.enum(['ru']),
    /* время согласия с медицинским дисклеймером */
    consents: f.shape({ medical: f.timestamp() }),
    onboardedAt: f.timestamp()
  },
  check(p) {
    if (p.birthDate) {
      const y = Number(p.birthDate.slice(0, 4));
      if (y < 1900) return 'birthDate: слишком рано';
    }
    return null;
  }
});
