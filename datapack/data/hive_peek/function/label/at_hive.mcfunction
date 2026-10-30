# Runs at the centre of the hive. Places the label in the top-left corner of the front face, as seen by someone facing it.
execute store result score #count hive_peek run data get block ~ ~ ~ bees
execute if block ~ ~ ~ #minecraft:beehives[facing=south] positioned ~-0.28 ~0.14 ~0.503 rotated 0 0 run return run function hive_peek:label/show
execute if block ~ ~ ~ #minecraft:beehives[facing=north] positioned ~0.28 ~0.14 ~-0.503 rotated 180 0 run return run function hive_peek:label/show
execute if block ~ ~ ~ #minecraft:beehives[facing=east] positioned ~0.503 ~0.14 ~0.28 rotated -90 0 run return run function hive_peek:label/show
execute if block ~ ~ ~ #minecraft:beehives[facing=west] positioned ~-0.503 ~0.14 ~-0.28 rotated 90 0 run return run function hive_peek:label/show
