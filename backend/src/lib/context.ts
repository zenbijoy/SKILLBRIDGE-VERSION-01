import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestStore {
  requestId: string;
  userId?: string;
  userRoles?: string[];
  route?: string;
  method?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestStore>();

export const requestContext = {
  run<T>(store: RequestStore, callback: () => T): T {
    return asyncLocalStorage.run(store, callback);
  },
  getStore(): RequestStore | undefined {
    return asyncLocalStorage.getStore();
  },
  getRequestId(): string | undefined {
    return asyncLocalStorage.getStore()?.requestId;
  },
  getUserId(): string | undefined {
    return asyncLocalStorage.getStore()?.userId;
  },
  setUserId(userId: string): void {
    const store = asyncLocalStorage.getStore();
    if (store) {
      store.userId = userId;
    }
  },
  setUserRoles(roles: string[]): void {
    const store = asyncLocalStorage.getStore();
    if (store) {
      store.userRoles = roles;
    }
  },
};
