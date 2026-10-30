# Cast as far as the player can reach (4.5 blocks in survival, 5 in creative), in 0.1 block steps
execute store result score #steps hive_peek run attribute @s minecraft:block_interaction_range get 10
function hive_peek:ray/step
