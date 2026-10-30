# Armor stands have no reach attribute, so use the survival default of 4.5 blocks
scoreboard players set #steps hive_peek 45
function hive_peek:ray/step
