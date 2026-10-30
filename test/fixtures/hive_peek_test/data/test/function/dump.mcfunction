data modify storage test:tmp e set value {}
data modify storage test:tmp e.pos set from entity @s Pos
data modify storage test:tmp e.rot set from entity @s Rotation
data modify storage test:tmp e.text set from entity @s text
data modify storage test:out labels append from storage test:tmp e
