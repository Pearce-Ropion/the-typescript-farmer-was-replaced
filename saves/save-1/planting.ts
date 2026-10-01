import {
  Entities,
  Grounds,
  Items,
  canHarvest,
  getEntityType,
  getGroundType,
  getPosX,
  getPosY,
  harvest,
  measureEntity,
  numItems,
  plant,
  till,
} from 'farmer';

import * as drone from './drone';
import * as utils from './utils';
import * as world from './world';

let pumpkinSizeRef = 0;

const MIN_SUNFLOWER = 10;
const SINGLE_SLOT_ENTITIES: Entities[] = [
  Entities.Grass,
  Entities.Bush,
  Entities.Carrot,
  Entities.Sunflower,
];

export function getPumpkinSize(): number {
  const worldEdge = world.getWorldEdge();

  if (pumpkinSizeRef === 0) {
    pumpkinSizeRef = Math.floor(worldEdge / 2);
  }
  return pumpkinSizeRef;
}

export function canAfford(entity: Entities): boolean {
  if (entity === Entities.Pumpkin) {
    return numItems(Items.Carrot) >= 2;
  }
  if (entity === Entities.Sunflower) {
    return numItems(Items.Carrot) >= 1;
  }
  if (entity === Entities.Carrot) {
    return numItems(Items.Hay) >= 1 && numItems(Items.Wood) >= 1;
  }
  if (entity === Entities.Bush) {
    return true;
  }
  if (entity === Entities.Grass) {
    return true;
  }
  return false;
}

export function plantSpaceRequirement(entity: Entities): number {
  if (entity === Entities.Tree) {
    return 2;
  }
  return 1;
}

export function harvestPlant(): void {
  const entity = getEntityType();

  harvest();
  world.setEntity(null);

  if (entity === Entities.Sunflower) {
    world.toggleSunflower(false);
  }
}

export function harvestPumpkin(): void {
  harvest();

  const pumpkinSize = getPumpkinSize();
  for (let x = 0; x < pumpkinSize; x++) {
    for (let y = 0; y < pumpkinSize; y++) {
      world.setEntity(null, x, y);
    }
  }
}

export function plantPlant(entity: Entities): void {
  plant(entity);
  world.setEntity(entity);
  if (entity === Entities.Sunflower) {
    world.toggleSunflower(true);
    world.setEntityPower(measureEntity());
  }
}

export function plantTree(): void {
  plant(Entities.Tree);
}

export function choosePlant(): void {
  const x = getPosX();
  const y = getPosY();

  const pumpkinSize = getPumpkinSize();

  if (x < pumpkinSize && y < pumpkinSize && canAfford(Entities.Pumpkin)) {
    plantPlant(Entities.Pumpkin);
  } else {
    if (world.getSunflowerCount() < MIN_SUNFLOWER && canAfford(Entities.Sunflower)) {
      plantPlant(Entities.Sunflower);
    } else {
      let entity = utils.randomItem(SINGLE_SLOT_ENTITIES);
      while (!canAfford(entity)) {
        entity = utils.randomItem(SINGLE_SLOT_ENTITIES);
      }
      plantPlant(entity);
    }
  }
}

export function harvestAndPlant(): void {
  if (getGroundType() === Grounds.Grassland) {
    if (canHarvest()) {
      harvestPlant();
    }
    till();
  }

  if (canHarvest()) {
    if (getEntityType() === Entities.Pumpkin) {
      const pumpkinSize = getPumpkinSize();
      if (drone.getX() === drone.getY() && drone.getY() === pumpkinSize - 1) {
        harvestPumpkin();
      }
    } else {
      harvestPlant();
      choosePlant();
    }
  }

  if (getEntityType() === null || getEntityType() === Entities.Dead_Pumpkin) {
    choosePlant();
  }
}
