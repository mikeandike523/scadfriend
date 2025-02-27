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

EYE_DIAMETER=12;

module sclera(){

}