import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Limpieza explícita entre tests: el auto-cleanup de RTL no alcanza para
// descartar DOM dejado por archivos de test anteriores en el mismo fork
// (--poolOptions.forks.singleFork comparte el jsdom entre archivos), lo que
// producía fallos intermitentes "Found multiple elements".
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

// Minimal in-memory IndexedDB mock for idb-keyval in Vitest/jsdom environment
if (typeof globalThis.indexedDB === 'undefined') {
  const store = new Map<string, any>();

  const createRequest = (resultSupplier: () => any) => {
    const req: any = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
      oncomplete: null,
    };
    Promise.resolve().then(() => {
      try {
        req.result = resultSupplier();
        if (typeof req.onsuccess === 'function') {
          req.onsuccess({ target: req });
        }
        if (typeof req.oncomplete === 'function') {
          req.oncomplete({ target: req });
        }
      } catch (err) {
        req.error = err;
        if (typeof req.onerror === 'function') {
          req.onerror({ target: req });
        }
      }
    });
    return req;
  };

  const mockIDB = {
    open: (_name: string, _version?: number) => {
      const openReq: any = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        oncomplete: null,
      };

      Promise.resolve().then(() => {
        const db = {
          objectStoreNames: {
            contains: () => true,
          },
          createObjectStore: (_storeName: string) => ({}),
          transaction: (_storeNames: any, _mode: string) => {
            const tx: any = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              onsuccess: null,
              objectStore: (_sName: string) => {
                const objectStoreObj: any = {
                  get: (key: string) => createRequest(() => store.get(key)),
                  put: (val: any, key: string) => {
                    store.set(key, val);
                    return createRequest(() => undefined);
                  },
                  delete: (key: string) => {
                    store.delete(key);
                    return createRequest(() => undefined);
                  },
                  clear: () => {
                    store.clear();
                    return createRequest(() => undefined);
                  },
                  getAllKeys: () => createRequest(() => Array.from(store.keys())),
                  getAll: () => createRequest(() => Array.from(store.values())),
                };
                objectStoreObj.transaction = tx;
                return objectStoreObj;
              },
            };
            Promise.resolve().then(() => {
              if (typeof tx.oncomplete === 'function') {
                tx.oncomplete({ target: tx });
              }
              if (typeof tx.onsuccess === 'function') {
                tx.onsuccess({ target: tx });
              }
            });
            return tx;
          },
        };

        openReq.result = db;
        if (typeof openReq.onupgradeneeded === 'function') {
          openReq.onupgradeneeded({ target: openReq });
        }
        if (typeof openReq.onsuccess === 'function') {
          openReq.onsuccess({ target: openReq });
        }
        if (typeof openReq.oncomplete === 'function') {
          openReq.oncomplete({ target: openReq });
        }
      });

      return openReq;
    },
  };

  (globalThis as any).indexedDB = mockIDB;
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {};
}



