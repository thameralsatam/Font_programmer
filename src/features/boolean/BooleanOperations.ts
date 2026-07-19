import { DrawCmd } from '../../types';

export class BooleanOperations {
  static union(shapeA: DrawCmd[], shapeB: DrawCmd[]): DrawCmd[] {
    // To be implemented using paper.js/clipper in future phase
    return shapeA;
  }

  static subtract(shapeA: DrawCmd[], shapeB: DrawCmd[]): DrawCmd[] {
    return shapeA;
  }

  static intersect(shapeA: DrawCmd[], shapeB: DrawCmd[]): DrawCmd[] {
    return shapeA;
  }

  static exclude(shapeA: DrawCmd[], shapeB: DrawCmd[]): DrawCmd[] {
    return shapeA;
  }
}
