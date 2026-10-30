kill @e[type=text_display,tag=hive_peek.label]
scoreboard objectives remove hive_peek
tellraw @s [{text:"Hive Peek removed. ",color:"gold"},{text:"Delete it from the world's datapacks folder, or it will turn back on at the next reload.",color:"yellow"}]
