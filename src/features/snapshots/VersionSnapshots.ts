import { Glyph } from '../../types';

export interface Snapshot {
  id: string;
  projectId: string;
  glyphId: string;
  timestamp: number;
  label: string;
  glyph: Glyph;
}

export class VersionSnapshots {
  static async saveSnapshot(projectId: string, glyphId: string, label: string, glyph: Glyph): Promise<Snapshot> {
    // Logic deleted as requested.
    const mockSnapshot: Snapshot = {
      id: 'mock',
      projectId,
      glyphId,
      timestamp: Date.now(),
      label,
      glyph
    };
    return Promise.resolve(mockSnapshot);
  }

  static async getSnapshotsForGlyph(projectId: string, glyphId: string): Promise<Snapshot[]> {
    // Logic deleted as requested.
    return Promise.resolve([]);
  }

  static async getSnapshotsForProject(projectId: string): Promise<Snapshot[]> {
    // Logic deleted as requested.
    return Promise.resolve([]);
  }

  static async deleteSnapshot(id: string): Promise<void> {
    // Logic deleted as requested.
    return Promise.resolve();
  }
}
