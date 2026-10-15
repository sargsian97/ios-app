/* Синхронизация между устройствами. Пока только локальный режим: всё живёт на телефоне.
   Чтобы подключить облако (Firebase, Supabase и т.п.), нужно реализовать тот же интерфейс
   и вернуть его из pickSyncProvider().

   interface SyncProvider {
     id: string;                         // 'local' | 'supabase' | ...
     available(): boolean;               // можно ли включить на этом устройстве
     account(): { email?: string } | null;
     signIn(): Promise<void>;
     signOut(): Promise<void>;
     push(changes: { col, id, data | null }[]): Promise<void>;
     pull(since: string | null): Promise<{ changes, cursor }>;
   } */

export const localProvider = Object.freeze({
  id: 'local',
  available: () => true,
  account: () => null,
  async signIn() { throw new Error('Вход появится, когда будет подключена синхронизация.'); },
  async signOut() {},
  async push() {},
  async pull() { return { changes: [], cursor: null }; }
});

export function pickSyncProvider() {
  return localProvider;
}
