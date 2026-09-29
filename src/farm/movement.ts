import { Direction, move } from 'farmer';

import * as drone from './drone';
import * as world from './world';

let directionRef = 1;

export function getDirection(): number {
  return directionRef;
}

export function setDirection(direction: number): void {
  directionRef = direction;
}

export function toggleDirection(): void {
  if (directionRef === 1) {
    setDirection(-1);
  } else {
    setDirection(1);
  }
}

export function autoMoveFarmer(edgeLength = world.getWorldEdge()): void {
  const x = drone.getX();
  const y = drone.getY();

  if (getDirection() === 1) {
    if (y % 2 === 1 && x === 0) {
      move(Direction.North);
    } else {
      move(Direction.East);
      if (x + 1 === edgeLength - 1) {
        toggleDirection();
      }
    }
  } else {
    if (y % 2 === 0 && x === edgeLength - 1) {
      move(Direction.North);
    } else {
      move(Direction.West);
      if (x - 1 === 0) {
        toggleDirection();
      }
    }
  }
}

export function resetPosition(): void {
  const x = drone.getX();
  const y = drone.getY();

  for (let i = 0; i < x; i++) {
    move(Direction.West);
  }
  for (let i = 0; i < y; i++) {
    move(Direction.South);
  }
}

export function moveDirection(direction: Direction, count = 1): void {
  for (let i = 0; i < count; i++) {
    move(direction);
  }
}
