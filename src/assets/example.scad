// Helper Functions

// Creates a box occupying the space between two given points
// Point coordinates are sorted so the contained region will always be a positive volume
module two_point_box(
    A, // The first point [x, y, z]
    B, // The second point [x, y, z]
){
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

EYE_DIAMETER=24;

SCLERA_THICKNESS=1;

// Sclera is composed of a sphere and elongate portion which is akin to a truncated cone
SCLERA_ELONGATED_FRONT_PORTION_FRACTION=0.25;

SCLERA_CONE_OPENING_DIAMETER=15;

sclera_cutting_box_x_offset = SCLERA_ELONGATED_FRONT_PORTION_FRACTION*EYE_DIAMETER;

CONE_TRUNCATION_LENGTH_FRACTION= 0.75;

cone_truncation_length = SCLERA_ELONGATED_FRONT_PORTION_FRACTION*EYE_DIAMETER*CONE_TRUNCATION_LENGTH_FRACTION;

cone_slope = (EYE_DIAMETER/2-SCLERA_CONE_OPENING_DIAMETER/2)/cone_truncation_length;

cone_start_radius_computation_angle = acos(sclera_cutting_box_x_offset/(EYE_DIAMETER/2));

sclera_inner_radius = EYE_DIAMETER/2-SCLERA_THICKNESS;

cone_start_radius = EYE_DIAMETER/2*sin(cone_start_radius_computation_angle);

cone_start_inner_radius_computation_angle=acos(sclera_cutting_box_x_offset/sclera_inner_radius);

cone_start_inner_radius = sclera_inner_radius * sin(cone_start_inner_radius_computation_angle);

cone_thickness = cone_start_radius - cone_start_inner_radius;



module sclera(){

    difference(){
        union(){
            difference(){
                sphere(r=EYE_DIAMETER/2,$fn=64);

                sphere(r=EYE_DIAMETER/2-SCLERA_THICKNESS,$fn=64);


                translate([sclera_cutting_box_x_offset, 0, 0])
                rotate([0, 90, 0]) 
                cylinder(h = cone_truncation_length, r = EYE_DIAMETER/2 , $fn=64);
            }

            // Create the truncated cone shell using rotate_extrude
            translate([sclera_cutting_box_x_offset, 0, 0])
            rotate([0, 90, 0]) 
            rotate_extrude(angle=360,$fn=64)
            polygon(points=[
                [SCLERA_CONE_OPENING_DIAMETER/2, cone_truncation_length],
                [cone_start_radius,0],
                [cone_start_radius-cone_thickness,0],
                [SCLERA_CONE_OPENING_DIAMETER/2-cone_thickness, cone_truncation_length]
            ]);

        }


    two_point_box([
        sclera_cutting_box_x_offset+cone_truncation_length, -EYE_DIAMETER/2, EYE_DIAMETER/2
    ],[
        sclera_cutting_box_x_offset+cone_truncation_length+50, 
        EYE_DIAMETER/2,
        -EYE_DIAMETER/2
    ]);

    }


}

// @export sclera
color("white")
sclera();