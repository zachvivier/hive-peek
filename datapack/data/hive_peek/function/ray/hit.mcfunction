# The ray stopped at the first solid block. Only hives and nests get a label.
execute if block ~ ~ ~ #minecraft:beehives align xyz positioned ~0.5 ~0.5 ~0.5 run function hive_peek:label/at_hive
