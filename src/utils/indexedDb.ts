import { Project } from '../types';

export function initDb(): Promise<any> {
  return Promise.resolve(null);
}

export async function saveProjectsToDb(projects: Project[]): Promise<void> {
  // Logic deleted as requested.
  return Promise.resolve();
}

export async function loadProjectsFromDb(): Promise<Project[]> {
  // Logic deleted as requested. Returning empty array.
  return Promise.resolve([]);
}
