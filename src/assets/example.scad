// Helper Functions

// Creates a box occupying the space between two given points
// Point coordinates are sorted so the contained region will always be a positive volume
module two_point_box(A, B){
    // Sort coordinates to ensure positive volume
    x_min = min(A[0], B[0]);
    y_min = min(A[1], B[1]);
    z_min = min(A[2], B[2]);
    
    x_max = max(A[0], B[0]);
    y_max = max(A[1], B[1]);
    z_max = max(A[2], B[2]);
    
    // Calculate dimensions
    width = x_max - x_min;
    depth = y_max - y_min;
    height = z_max - z_min;
    
    // Create the box
    translate([x_min, y_min, z_min])
        cube([width, depth, height]);
}

// The Human (Right) Eye 

// Item 1: Sclera

EYE_DIAMETER = 24;
SCLERA_THICKNESS = 1;
SCLERA_ELONGATED_PORTION_START=10;
SCLERA_ELONGATED_PORTION_LENGTH=8;
SCLERA_OPENING_OUTER_DIAMETER=30;

// Item 2: Choroid

CHOROID_THICKNESS=0.250;
CHOROID_ELONGATED_PORTION_START=SCLERA_ELONGATED_PORTION_START;
CHOROID_ELONGATED_PORTION_LENGTH=7;
CHOROID_OPENING_OUTER_DIAMETER=27;


// Module to create an elongated ball (spherical portion with an elongated truncated cone extension)
module elongated_ball(
    inner_radius,        // inner radius of the spherical shell
    outer_radius,        // outer radius of the spherical shell
    elongation_start,    // x-offset where the elongation (cone) starts
    elongation_length,   // length of the elongated (cone) portion
    opening_outer_radius,// outer radius at the tip of the cone (opening)
    facets=64
){
    // Calculate derived parameters for the truncated cone:
    // Compute the effective radius at the sphere boundary where the elongation starts.
    cone_start_radius = outer_radius * sqrt(1 - (elongation_start/outer_radius) * (elongation_start/outer_radius));
    cone_start_inner_radius = inner_radius * sqrt(1 - (elongation_start/inner_radius) * (elongation_start/inner_radius));
    thickness = cone_start_radius - cone_start_inner_radius;
    
    difference(){
        union(){
            // Create the spherical shell and remove the part that will be elongated
            difference(){
                sphere(r = outer_radius, $fn = facets);
                sphere(r = inner_radius, $fn = facets);
                translate([elongation_start, 0, 0])
                    rotate([0, 90, 0])
                    cylinder(h = elongation_length, r = outer_radius, $fn = facets);
            }
            // Create the shell for the truncated cone using rotate_extrude
            translate([elongation_start, 0, 0])
                rotate([0, 90, 0])
                rotate_extrude(angle = 360, $fn = facets)
                    polygon(points = [
                        [opening_outer_radius, elongation_length],
                        [cone_start_radius, 0],
                        [cone_start_inner_radius, 0],
                        [opening_outer_radius - thickness, elongation_length]
                    ]);
        }
        // Subtract a cutting box to remove extraneous geometry
        two_point_box(
            [elongation_start + elongation_length, -outer_radius, outer_radius],
            [elongation_start + elongation_length + 50, outer_radius, -outer_radius]
        );
    }
}

// Now we can define sclera() using the elongated_ball module
module sclera(){
    elongated_ball(
        inner_radius=EYE_DIAMETER-SCLERA_THICKNESS,
        outer_radius=EYE_DIAMETER,
        elongation_start=SCLERA_ELONGATED_PORTION_START,
        elongation_length=SCLERA_ELONGATED_PORTION_LENGTH,
        opening_outer_radius=SCLERA_OPENING_OUTER_DIAMETER/2
    );
}

module choroid(){
    elongated_ball(
        inner_radius=EYE_DIAMETER-SCLERA_THICKNESS-CHOROID_THICKNESS,
        outer_radius=EYE_DIAMETER-SCLERA_THICKNESS,
        elongation_start=CHOROID_ELONGATED_PORTION_START,
        elongation_length=CHOROID_ELONGATED_PORTION_LENGTH,
        opening_outer_radius=CHOROID_OPENING_OUTER_DIAMETER/2
    );
}

// @export sclera
color("white")
sclera();

// @export choroid
color("red")
choroid();