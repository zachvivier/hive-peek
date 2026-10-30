# Labels that no player is looking at this tick get removed
tag @e[type=text_display,tag=hive_peek.label] add hive_peek.stale
execute as @a[gamemode=!spectator] at @s anchored eyes positioned ^ ^ ^ run function hive_peek:ray/start
kill @e[type=text_display,tag=hive_peek.stale]
