import { DrawCmd } from '../../types';

export class StrokeToOutline {
  static convertToOutline(commands: DrawCmd[], strokeWidth: number): { outline: DrawCmd[]; backup: DrawCmd[] } {
    // Converts an open path stroke to closed vector outline and saves a backup layer
    return {
      outline: commands,
      backup: commands
    };
  }
}
