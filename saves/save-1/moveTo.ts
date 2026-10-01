import { Direction, abs, move } from 'farmer';

import * as drone from './drone';
import { mod } from './utils';
import * as world from './world';

export function moveTo(x2: number, y2: number): void {
  const worldEdge = world.getWorldEdge();
  const worldEdgeHalf = worldEdge / 2;

  const x1 = drone.getX();
  const y1 = drone.getY();

  const dx = mod(x2 - x1 + worldEdgeHalf, worldEdge) - worldEdgeHalf;
  const dy = mod(y2 - y1 + worldEdgeHalf, worldEdge) - worldEdgeHalf;

  let xDir = Direction.West;
  if (dx > 0) {
    xDir = Direction.East;
  }
  let yDir = Direction.South;
  if (dy > 0) {
    yDir = Direction.North;
  }

  const distX = abs(dx);
  for (let i = 0; i < distX; i++) {
    move(xDir);
  }

  const distY = abs(dy);
  for (let i = 0; i < distY; i++) {
    move(yDir);
  }
}
