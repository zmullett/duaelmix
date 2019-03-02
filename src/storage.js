const dbName = 'duaelmix';
const dbFilesObjectStore = 'files';
const dbFilesKeyPath = 'name';
const dbFilesArraybuffer = 'arrayBuffer';

export const getDb = () => {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject('IndexedDB not supported');
    }
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore(dbFilesObjectStore, {keyPath: dbFilesKeyPath});
    };
    request.onsuccess = (event) => { resolve(event.target.result); };
    request.onerror = (event) => { reject(event.target.error); };
  });
};

const requestAsyncWrap = (requestReturnerFunc) => {
  return new Promise((resolve, reject) => {
    const request = requestReturnerFunc();
    request.onsuccess = (event) => { resolve(event.target.result); };
    request.onerror = (event) => { reject(event.target.error); };
  });
};

export const storeFile = (db, key, arrayBuffer) => {
  const record = {
    [dbFilesKeyPath]: key,
    [dbFilesArraybuffer]: arrayBuffer,
  };
  const txn = db.transaction([dbFilesObjectStore], 'readwrite');
  const objectStore = txn.objectStore(dbFilesObjectStore);
  return new Promise((resolve, reject) => {
    const request = objectStore.add(record);
    request.onsuccess = () => { resolve(); };
    request.onerror = (event) => { reject(event.target.error); };
  });
};

export const getAllKeys = async (db) => {
  const txn = db.transaction([dbFilesObjectStore], 'readonly');
  const objectStore = txn.objectStore(dbFilesObjectStore);
  return await requestAsyncWrap(() => objectStore.getAllKeys());
};

export const retrieveFile = async (db, key) => {
  const txn = db.transaction([dbFilesObjectStore], 'readonly');
  const objectStore = txn.objectStore(dbFilesObjectStore);
  const result = await requestAsyncWrap(() => objectStore.get(key));
  if (result === undefined) {
    throw 'Unavailable: ' + key;
  }
  return result[dbFilesArraybuffer];
};

export const deleteFile = async (db, key) => {
  const txn = db.transaction([dbFilesObjectStore], 'readwrite');
  const objectStore = txn.objectStore(dbFilesObjectStore);
  await requestAsyncWrap(() => objectStore.delete(key));
};

export const readFileContents = (file) => {
  const fileReader = new FileReader();
  return new Promise((resolve) => {
    fileReader.onloadend = (event) => { resolve(event.target.result); };
    fileReader.readAsArrayBuffer(file);
  });
};