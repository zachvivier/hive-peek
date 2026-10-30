execute as @n[type=text_display,tag=hive_peek.label,distance=..0.01] run return run function hive_peek:label/update
summon text_display ~ ~ ~ {Tags:["hive_peek.label","hive_peek.new"],billboard:"fixed",background:0,shadow:false,text_opacity:-96b,text:""}
execute as @n[type=text_display,tag=hive_peek.new,distance=..0.01] run function hive_peek:label/init
