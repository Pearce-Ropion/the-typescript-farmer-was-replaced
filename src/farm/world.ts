import { getWorldSize as getFarmWorldSize } from 'farmer';
import type { Entities } from 'farmer';

import * as drone from './drone';

interface WorldItem {
  entity: Entities | null;
  power?: number | null;
}

let worldEdgeRef = 0;
let worldSizeRef = 0;
let worldMapRef: Record<string, WorldItem> | null = null;
let sunflowerCountRef = 0;

function mapKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function getWorldEdge(): number {
  if (worldEdgeRef === 0) {
    worldEdgeRef = getFarmWorldSize();
  }
  return worldEdgeRef;
}

export function getWorldSize(): number {
  if (worldSizeRef === 0) {
    worldSizeRef = getWorldEdge() ** 2;
  }
  return worldSizeRef;
}

export function getWorldMap(): Record<string, WorldItem> {
  if (worldMapRef === null) {
    worldMapRef = {};
  }
  return worldMapRef;
}

export function getSunflowerCount(): number {
  return sunflowerCountRef;
}

export function toggleSunflower(increment: boolean): void {
  if (increment) {
    sunflowerCountRef += 1;
  } else {
    sunflowerCountRef -= 1;
  }
}

export function getMapItem(x = drone.getX(), y = drone.getY()): WorldItem | null {
  const worldMap = getWorldMap();
  const key = mapKey(x, y);
  if (!(key in worldMap)) {
    return null;
  }
  return worldMap[key];
}

export function getEntity(x = drone.getX(), y = drone.getY()): Entities | null {
  const item = getMapItem(x, y);
  if (item === null) {
    return null;
  }
  return item.entity;
}

export function getEntityPower(x = drone.getX(), y = drone.getY()): number {
  const item = getMapItem(x, y);
  if (item === null) {
    return 0;
  }
  return item.power || 0;
}

export function setEntity(entity: Entities | null, x = drone.getX(), y = drone.getY()): void {
  const worldMap = getWorldMap();
  const key = mapKey(x, y);
  let item = getMapItem(x, y);
  if (item === null) {
    item = { entity, power: null };
    worldMap[key] = item;
  }
  item.entity = entity;
}

export function setEntityPower(power: number | null, x = drone.getX(), y = drone.getY()): void {
  const item = getMapItem(x, y);
  if (item === null) {
    return;
  }
  item.power = power;
}
