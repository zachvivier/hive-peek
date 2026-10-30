# One tick of Hive Peek, with the armor stand tagged "eye" standing in for a player
tag @e[type=text_display,tag=hive_peek.label] add hive_peek.stale
execute as @e[type=armor_stand,tag=eye] at @s anchored eyes positioned ^ ^ ^ run function test:ray
kill @e[type=text_display,tag=hive_peek.stale]
data remove storage test:out labels
execute as @e[type=text_display,tag=hive_peek.label] run function test:dump
