import { Entities, clear, getEntityType, measureEntity } from 'farmer';

import * as movement from './movement';
import * as planting from './planting';
import * as world from './world';

const SHOULD_CLEAR: boolean = false;

function scanWorld(): void {
  movement.resetPosition();
  for (let x = 0; x < world.getWorldEdge(); x++) {
    for (let y = 0; y < world.getWorldEdge(); y++) {
      const entity = getEntityType();
      if (entity !== null) {
        world.setEntity(entity, x, y);
        if (entity === Entities.Sunflower) {
          world.setEntityPower(measureEntity(), x, y);
          world.toggleSunflower(true);
        }
      }
      movement.autoMoveFarmer();
    }
  }
  movement.resetPosition();
}

if (SHOULD_CLEAR) {
  clear();
} else {
  scanWorld();
}

while (true) {
  planting.harvestAndPlant();
  movement.autoMoveFarmer();
}
