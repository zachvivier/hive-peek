tag @s remove hive_peek.stale
execute if score @s hive_peek = #count hive_peek run return 0
scoreboard players operation @s hive_peek = #count hive_peek
execute if score #count hive_peek matches 0 run data modify entity @s text set value {text:"0",color:"#3c2810"}
execute if score #count hive_peek matches 1 run data modify entity @s text set value {text:"1",color:"#3c2810"}
execute if score #count hive_peek matches 2 run data modify entity @s text set value {text:"2",color:"#3c2810"}
execute if score #count hive_peek matches 3 run data modify entity @s text set value {text:"3",color:"#3c2810"}
execute if score #count hive_peek matches 4.. run data modify entity @s text set value {text:"3+",color:"#3c2810"}
