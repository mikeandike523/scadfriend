//
// Simple Ball-and-Socket Joint Example — OpenSCAD (stem +Z, socket opens +Z)
//

// --- Parameters ---
ball_d       = 20;     // diameter of the ball
stem_len     = 10;     // length of stem
stem_d       = 8;      // diameter of stem
socket_clear = 0.4;    // extra clearance between ball and socket
socket_depth = 15;     // depth of socket cup (below the lip)
lip_thick    = 2;      // thickness of retaining lip over ball
wall_thick   = 3;      // wall thickness of socket
base_d       = 30;     // base diameter for socket part
ball_stem_overlap = 1; // overlap to fuse ball & stem solids

$fn = 64; // smooth spheres/cylinders

// --- Modules ---

// Ball with stem (stem points +Z)
module ball_part() {
    union() {
        sphere(d=ball_d);
        translate([0, 0, stem_len/2 + ball_d/2 - ball_stem_overlap/2])
            cylinder(d=stem_d, h=stem_len + ball_stem_overlap, center=true);
    }
}

// Socket that holds the ball (opening faces +Z)
module socket_part() {
    difference() {
        // Outer shell sits below Z=0 so the mouth (opening) is at Z=0 facing +Z
        translate([0,0,-(socket_depth + wall_thick)])
            cylinder(d=base_d, h=socket_depth + wall_thick);

        // Spherical cavity for the ball (with clearance), centered just below the lip
        translate([0,0,-wall_thick])
            sphere(d=ball_d + socket_clear*2);

        // Trim the front (positive Z) half to make the opening at Z>=0
        translate([0,0,0])
            cylinder(d=ball_d*2, h=ball_d);  // removes anything above Z=0 in the cavity

        // Tunnel for the stem along +Z
        translate([0,0,0])
            cylinder(d=stem_d + socket_clear*2, h=socket_depth + ball_d);
    }

    // Retaining lip right under the mouth (overhangs the ball slightly)
    difference() {
        // Lip ring: just below Z=0
        translate([0,0,-lip_thick])
            cylinder(d=ball_d + socket_clear*2 + lip_thick*2, h=lip_thick);
        // Inner clearance of the lip
        translate([0,0,-lip_thick])
            cylinder(d=ball_d + socket_clear*2, h=lip_thick + 0.1);
    }
}

// --- EXPORTS ---
// @export BALL
color("blue") ball_part();

// @export SOCKET
color("red") socket_part();
