// OpenSCAD Example: Two blocks connected by a dowel
// Use //@export to define individual parts for the inspector

// Parameters
block_size = 30;
dowel_radius = 5;
dowel_length = 40;
spacing = 10;

// First block (red)
// @export block1
color("red")
    difference() {
        cube(block_size);
        translate([block_size/2, block_size/2, -1])
            cylinder(h=block_size+2, r=dowel_radius);
    }

// Second block (blue)
// @export block2
color("blue")
    translate([0, 0, block_size + spacing])
    difference() {
        cube(block_size);
        translate([block_size/2, block_size/2, -1])
            cylinder(h=block_size+2, r=dowel_radius);
    }

// Dowel (green)
// @export dowel
color("green")
    translate([block_size/2, block_size/2, 0])
    cylinder(h=block_size + spacing + block_size, r=dowel_radius);