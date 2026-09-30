export declare enum Direction {
  /**
   * The direction north, i.e. up.
   */
  North,
  /**
   * The direction east, i.e. right.
   */
  East,
  /**
   * The direction south, i.e. down.
   */
  South,
  /**
   * The direction west, i.e. left.
   */
  West,
}

export declare enum Entities {
  /**
   * Dinosaurs love them apparently.
   */
  Apple,
  /**
   * A small bush that drops `Items.Wood`.
   *
   * Average seconds to grow: 4
   * Grows on: grassland or soil
   */
  Bush,
  /**
   * Cacti come in 10 different sizes (0-9). When harvested, adjacent cacti that are in sorted order will also be harvested recursively.
   * You receive cactus equal to the number of harvested cacti squared.
   *
   * Average seconds to grow: 1
   * Grows on: soil
   */
  Cactus,
  /**
   * Carrots!
   *
   * Average seconds to grow: 6
   * Grows on: soil
   */
  Carrot,
  /**
   * One in five pumpkins dies when it grows up, leaving behind a dead pumpkin. Dead pumpkins are useless and disappear when something new is planted.
   * `canHarvest()` always returns `false` on dead pumpkins.
   */
  Dead_Pumpkin,
  /**
   * A piece of the tail of the dinosaur hat. When wearing the dinosaur hat, the tail is dragged behind the drone filling previously moved tiles.
   *
   * Average seconds to grow: 0.2
   * Grows on: grassland or soil
   */
  Dinosaur,
  /**
   * Grows automatically on grassland. Harvest it to obtain `Items.Hay`.
   *
   * Average seconds to grow: 0.5
   * Grows on: grassland or soil
   */
  Grass,
  /**
   * Part of the maze.
   */
  Hedge,
  /**
   * Pumpkins grow together when they are next to other fully grown pumpkins. About 1 in 5 pumpkins dies when it grows up.
   * When you harvest a pumpkin you get `Items.Pumpkin` equal to the number of pumpkins in the mega pumpkin cubed.
   *
   * Average seconds to grow: 2
   * Grows on: soil
   */
  Pumpkin,
  /**
   * Sunflowers collect the power from the sun. Harvesting them will give you `Items.Power`.
   * If you harvest a sunflower with the maximum number of petals (and there are at least 10 sunflowers) you get 5x bonus power.
   *
   * Average seconds to grow: 5
   * Grows on: soil
   */
  Sunflower,
  /**
   * A treasure that contains gold equal to the side length of the maze in which it is hidden. It can be harvested like a plant.
   */
  Treasure,
  /**
   * Trees drop more wood than bushes. They take longer to grow if other trees grow next to them.
   *
   * Average seconds to grow: 7
   * Grows on: grassland or soil
   */
  Tree,
}

export declare enum Grounds {
  /**
   * The default ground. Grass will automatically grow on it.
   */
  Grassland,
  /**
   * Calling `till()` turns the ground into this. Calling `till()` again changes it back to grassland.
   */
  Soil,
}

export declare enum Hats {
  /**
   * A brown hat.
   */
  Brown_Hat,
  /**
   * A hat shaped like a cactus.
   */
  Cactus_Hat,
  /**
   * A hat shaped like a carrot.
   */
  Carrot_Hat,
  /**
   * Equip it to start the dinosaur game.
   */
  Dinosaur_Hat,
  /**
   * A golden hat.
   */
  Gold_Hat,
  /**
   * A golden trophy hat.
   */
  Gold_Trophy_Hat,
  /**
   * A golden hat shaped like a cactus.
   */
  Golden_Cactus_Hat,
  /**
   * A golden hat shaped like a carrot.
   */
  Golden_Carrot_Hat,
  /**
   * A golden version of the gold hat.
   */
  Golden_Gold_Hat,
  /**
   * A golden hat shaped like a pumpkin.
   */
  Golden_Pumpkin_Hat,
  /**
   * A golden hat shaped like a sunflower.
   */
  Golden_Sunflower_Hat,
  /**
   * A golden hat shaped like a tree.
   */
  Golden_Tree_Hat,
  /**
   * A gray hat.
   */
  Gray_Hat,
  /**
   * A green hat.
   */
  Green_Hat,
  /**
   * A hat shaped like a pumpkin.
   */
  Pumpkin_Hat,
  /**
   * A purple hat.
   */
  Purple_Hat,
  /**
   * A silver trophy hat.
   */
  Silver_Trophy_Hat,
  /**
   * The default hat.
   */
  Straw_Hat,
  /**
   * A hat shaped like a sunflower.
   */
  Sunflower_Hat,
  /**
   * Unlocks the special hat 'The Farmers Remains'.
   */
  The_Farmers_Remains,
  /**
   * Unlocks the fancy Top Hat.
   */
  Top_Hat,
  /**
   * A traffic cone hat.
   */
  Traffic_Cone,
  /**
   * A stack of traffic cones as a hat.
   */
  Traffic_Cone_Stack,
  /**
   * A hat shaped like a tree.
   */
  Tree_Hat,
  /**
   * A magical wizard hat.
   */
  Wizard_Hat,
  /**
   * A wooden trophy hat.
   */
  Wood_Trophy_Hat,
}

export declare enum Items {
  /**
   * The bones of an ancient creature.
   */
  Bone,
  /**
   * Obtained by harvesting sorted cacti.
   */
  Cactus,
  /**
   * Obtained by harvesting carrots.
   */
  Carrot,
  /**
   * Call `useItem(Items.Fertilizer)` to instantly remove 2s from the plants remaining grow time.
   */
  Fertilizer,
  /**
   * Found in treasure chests in mazes.
   */
  Gold,
  /**
   * Obtained by cutting grass.
   */
  Hay,
  /**
   * This item has been removed from the game but remains as a nostalgia trophy.
   */
  Piggy,
  /**
   * Obtained by harvesting sunflowers. The drone automatically uses this to move twice as fast.
   */
  Power,
  /**
   * Obtained by harvesting pumpkins.
   */
  Pumpkin,
  /**
   * Used to water the ground by calling `useItem(Items.Water)`.
   */
  Water,
  /**
   * Call `useItem(Items.Weird_Substance)` on a bush to grow a maze, or on other plants to toggle their infection status.
   */
  Weird_Substance,
  /**
   * Obtained from bushes and trees.
   */
  Wood,
}

export declare enum Leaderboards {
  /**
   * Farm 33_554_432 cacti with multiple drones.
   */
  Cactus,
  /**
   * Farm 131_072_cacti with a single drone on an 8x8 farm.
   */
  Cactus_Single,
  /**
   * Farm 2_000_000_000 carrots with multiple drones.
   */
  Carrots,
  /**
   * Farm 100_000_000 carrots with a single drone on an 8x8 farm.
   */
  Carrots_Single,
  /**
   * Farm 33_488_928 bones with multiple drones.
   */
  Dinosaur,
  /**
   * The most prestigious category. Completely automate the game from a single farm plot to unlocking the leaderboards again.
   */
  Fastest_Reset,
  /**
   * Farm 2_000_000_000 hay with multiple drones.
   */
  Hay,
  /**
   * Farm 100_000_000 hay with a single drone on an 8x8 farm.
   */
  Hay_Single,
  /**
   * Farm 9_863_168_gold with multiple drones.
   */
  Maze,
  /**
   * Farm 616_448 gold with a single drone on an 8x8 farm.
   */
  Maze_Single,
  /**
   * Farm 200_000_000 pumpkins with multiple drones.
   */
  Pumpkins,
  /**
   * Farm 10_000_000 pumpkins with a single drone on an 8x8 farm.
   */
  Pumpkins_Single,
  /**
   * Farm 100_000 power with multiple drones.
   */
  Sunflowers,
  /**
   * Farm 10_000 power with a single drone on an 8x8 farm.
   */
  Sunflowers_Single,
  /**
   * Farm 10_000_000_000 wood with multiple drones.
   */
  Wood,
  /**
   * Farm 500_000_000 wood with a single drone on an 8x8 farm.
   */
  Wood_Single,
}

export declare enum Unlocks {
  /**
   * Automatically unlock things.
   */
  Auto_Unlock,
  /**
   * Unlock: Cactus!
   * Upgrade: Increases the yield and cost of cactus.
   */
  Cactus,
  /**
   * Unlock: Till the soil and plant carrots.
   * Upgrade: Increases the yield and cost of carrots.
   */
  Carrots,
  /**
   * Allows access to the cost of things.
   */
  Costs,
  /**
   * Tools to help with debugging programs.
   */
  Debug,
  /**
   * Functions to temporarily slow down the execution and make the grid smaller.
   */
  Debug_2,
  /**
   * Get access to dictionaries and sets.
   */
  Dictionaries,
  /**
   * Unlock: Majestic ancient creatures.
   * Upgrade: Increases the yield and cost of dinosaurs.
   */
  Dinosaurs,
  /**
   * Unlock: Expands the farm land and unlocks movement.
   * Upgrade: Expands the farm. This also clears the farm.
   */
  Expand,
  /**
   * Reduces the remaining growing time of the plant under the drone by 2 seconds.
   */
  Fertilizer,
  /**
   * Define your own functions.
   */
  Functions,
  /**
   * Increases the yield of grass.
   */
  Grass,
  /**
   * Unlocks new hat colors for your drone.
   */
  Hats,
  /**
   * Import code from other files.
   */
  Import,
  /**
   * Join the leaderboard for the fastest time in farming a specific crop or for the fastest reset of the farm.
   */
  Leaderboard,
  /**
   * Use lists to store lots of values.
   */
  Lists,
  /**
   * Unlocks a simple while loop.
   */
  Loops,
  /**
   * Unlock: A maze with a treasure in the middle.
   * Upgrade: Increases the gold in treasure chests.
   */
  Mazes,
  /**
   * Unlocks multiple drones and drone management functions.
   */
  Megafarm,
  /**
   * Arithmetic, comparison and logic operators.
   */
  Operators,
  /**
   * Unlocks planting.
   */
  Plant,
  /**
   * Use companion planting to increase the yield.
   */
  Polyculture,
  /**
   * Unlock: Pumpkins!
   * Upgrade: Increases the yield and cost of pumpkins.
   */
  Pumpkins,
  /**
   * The drone can see what's under it and where it is.
   */
  Senses,
  /**
   * Unlocks simulation functions for testing and optimization.
   */
  Simulation,
  /**
   * Increases the speed of the drone.
   */
  Speed,
  /**
   * Unlock: Sunflowers and Power.
   * Upgrade: Increases the power gained from sunflowers.
   */
  Sunflowers,
  /**
   * Unlocks the special hat 'The Farmers Remains'.
   */
  The_Farmers_Remains,
  /**
   * Functions to help measure performance.
   */
  Timing,
  /**
   * Unlocks the fancy Top Hat.
   */
  Top_Hat,
  /**
   * Unlocks trees.
   * Upgrade: Increases the yield of bushes and trees.
   */
  Trees,
  /**
   * Unlocks the `min()`, `max()` and `abs()` functions.
   */
  Utilities,
  /**
   * Assign values to variables.
   */
  Variables,
  /**
   * Water the plants to make them grow faster.
   */
  Watering,
}
