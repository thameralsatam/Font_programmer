export class ProjectLock {
  static generateTabId(): string {
    return 'mock-tab';
  }

  static async checkLock(projectId: string, tabId: string): Promise<boolean> {
    // ProjectLock logic deleted as requested.
    return Promise.resolve(false);
  }

  static async acquireLock(projectId: string, tabId: string): Promise<boolean> {
    // ProjectLock logic deleted as requested.
    return Promise.resolve(true);
  }

  static async updateHeartbeat(projectId: string, tabId: string): Promise<void> {
    // ProjectLock logic deleted as requested.
    return Promise.resolve();
  }

  static async releaseLock(projectId: string, tabId: string): Promise<void> {
    // ProjectLock logic deleted as requested.
    return Promise.resolve();
  }
}
