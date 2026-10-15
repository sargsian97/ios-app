/* Все репозитории приложения поверх одного хранилища */
import { createSingletonRepo } from '../repo.js';
import { Profile } from '../models/profile.js';

export function createRepos(store, opts) {
  return {
    profile: createSingletonRepo(store, Profile, opts)
  };
}
