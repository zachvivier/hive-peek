execute unless block ~ ~ ~ #hive_peek:see_through run return run function hive_peek:ray/hit
scoreboard players remove #steps hive_peek 1
execute if score #steps hive_peek matches 1.. positioned ^ ^ ^0.1 run function hive_peek:ray/step
