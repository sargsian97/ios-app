/* Подписи замеров, методов оценки жира и ракурсов фото */
import { t, hasKey } from '../../../i18n/index.js';

const lab = (prefix) => (k) => (hasKey(prefix + k) ? t(prefix + k) : k);
export const measureLabel = lab('body.m.');
export const fatMethodLabel = lab('body.fat.m.');
export const poseLabel = lab('body.pose.');
