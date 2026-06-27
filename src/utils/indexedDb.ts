import { Project } from '../types';

const DB_NAME = 'SmartFontDatabase';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

export function initDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function saveProjectsToDb(projects: Project[]): Promise<void> {
  try {
    const db = await initDb();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Clear and rewrite everything to match state
    store.clear();
    for (const project of projects) {
      store.put(project);
    }
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log("Successfully saved all projects to IndexedDB");
        resolve();
      };
      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error("Failed to save to IndexedDB, falling back to localStorage", error);
    try {
      localStorage.setItem('smart_font_projects', JSON.stringify(projects));
    } catch (e) {
      console.error("localStorage fallback failed as well:", e);
    }
  }
}

export async function loadProjectsFromDb(): Promise<Project[]> {
  try {
    const db = await initDb();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const projects = request.result as Project[];
        if (projects && projects.length > 0) {
          resolve(projects);
        } else {
          // Fallback to localStorage
          const saved = localStorage.getItem('smart_font_projects');
          if (saved) {
            try {
              resolve(JSON.parse(saved));
            } catch (e) {
              resolve([]);
            }
          } else {
            resolve([]);
          }
        }
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Failed to load from IndexedDB, falling back to localStorage", error);
    const saved = localStorage.getItem('smart_font_projects');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  }
}
