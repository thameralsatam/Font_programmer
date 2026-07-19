import { Project } from '../../types';

export class JsonBackupManager {
  static exportProjectAsJson(project: Project): string {
    return JSON.stringify(project, null, 2);
  }

  static importProjectFromJson(jsonStr: string): Project {
    const parsed = JSON.parse(jsonStr);
    if (!parsed.id || !parsed.name || !Array.isArray(parsed.glyphs)) {
      throw new Error('صيغة ملف JSON غير صالحة للمشروع');
    }
    return parsed as Project;
  }
}
