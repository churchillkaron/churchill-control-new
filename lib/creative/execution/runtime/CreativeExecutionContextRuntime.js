import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

export const CreativeExecutionContextRuntime = {
  run(context, callback) {
    return storage.run(context || {}, callback);
  },

  current() {
    return storage.getStore() || null;
  },
};
