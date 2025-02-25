// ---- OVERVIEW ----

// triangle.scad
// 
// A Triangular mounting surface that holds a NeoPixel breakout board and has holes to place wooden dowels
// These help form stackable units to create a arbitrarily tall tower of lights



// ---- PARAMETERS ----

// All spatial units in mm unless specified otherwise in its name


// ---- CAD RELATED PARAMETERS ----

/**
 * Controls the smoothness of the cylindrical portions of the design.
 * This includes cylinders used to form a hull
 * For example in the triangle plate corner rounding, the cylinder helping form the hull has FACETS_PER_CYLINDER
 * facets, and the number of exposed facets is FACETS_PER_CYLINDER/3
 */
FACETS_PER_CYLINDER = 96;

/**
 * Though I am not 100% sure, I vaguely recall observing that some boolean
 * operations fail when performing a difference with a flush surface
 * Although other operations reflect that this may only be a visual bug
 * Either way there is value to having proper visuals
 * This value indicates how much we should enlarge a "cutting" volume
 * along the surface's normal so it is not perfectly flush
 * @type {number}
 */
 SOLVER_TOLERANCE=0.100;


// ---- DESIGN PARAMETERS ----

/**
 * Distance of triangle plate center to the center of the cylinder that provides rounding.
 * @type {number}
 */
TRIANGLE_PLATE_SIZE = 30;

/**
 * The radius of the cylinder that provides rounding.
 * The rounding cylinder adds size,
 * such that DISTANCE_CENTER_TO_OUTERMOST_POINT = DISTANCE_CENTER_TO_CYLINDER_CENTER + CYLINDER_RADIUS
 * I.e. the cylinders are not inset.
 * @type {number}
 */
TRIANGLE_PLATE_ROUNDING_RADIUS = 10;

/**
 * Thickness of triangle plate.
 * @type {number}
 */
TRIANGLE_PLATE_THICKNESS = 17;

/**
 * Depth of the hole to hold the dowels.
 * @type {number}
 */
DOWEL_DEPTH = 7.5;

/**
 * The diameter of the wooden dowel.
 * This matches whatever dowel bought online.
 * @type {number}
 */
DOWEL_DIAMETER_INCHES = 3/8;

/**
 * A tolerance to assist with press-fit of the dowels and/or glue-fit.
 * @type {number}
 */
DOWEL_HOLE_DIAMETER_TOLERANCE= 0.400;

TRIANGLE_WEIGHT_REDUCTION_PLATE_SIZE=12.5;

TRIANGLE_WEIGHT_REDUCTION_THICKNESS=11;


/**
Excess material at the bottom of the mounting post
Helps ensure that the heat set insert sinks into a surface that is likely to have
a larger % infill due to slicer settings
*/
MOUNTING_POST_FLOOR_HEIGHT=1.6;
/**
* The thickness of the mounting post wall (encloses/supports the heat set insert)
*/
MOUNTING_POST_WALL_THICKNESS=0.475;

/*
* The diameter of the circle that defines the overall groove shape
* It is a circular groove
* 
* @remarks
* Hmm, should it be called a rabbet then?
*/
GROOVE_DIAMETER = 40;
/**
* The width of the groove is symmetrical around the edge of the circle
*/
GROOVE_WIDTH=2;
/*
* Depth of the groove from the top surface of the triangle plate
*/
GROOVE_DEPTH=4;
/**
* Used to adjust diffuser dome's tenon fit (press-fit vs. glue)
* Added to the total width of the groove. The groove is symmetrical over the GROOVE_DIAMETER
* So this is equivalent to adding GROOVE_WIDTH_TOLERANCE/2 to each side
* A positive number makes it wider, a negative number makes it narrower
*/
GROOVE_WIDTH_TOLERANCE=0.400;
/**
* Used if diffuser dome's tenon doesn't make it sit flush
* This can happen due to a variety of 3D printer settings and conditions
* A positive number makes it deeper, and a negative number makes it shallower
*/
GROOVE_DEPTH_TOLERANCE=0;
/**
* We will increase the number of facets for the groove as the diameter is large
*/
GROOVE_FACETS=96;



WIRING_CUTOUT_WIDTH=11.5;

WIRING_CUTOUT_LENGTH=20;

/**
* Distance from the edge of mounting post to the edge of the wiring cutout
* This can be conceptualized akin to the "wall thickness" between the cutout and the region supporting
* the mounting posts
*/
WIRING_CUTOUT_EDGE_TO_MOUNTING_POST_EDGE=-0.625;


INSERTION_CHANNEL_WIDTH=5;
/**
* Don't feel like doing the math for exact answer
* It's quicker to just use the size of the triangle plate
* Which is likely to be more than enough
*/
INSERTION_CHANNEL_LENGTH=TRIANGLE_PLATE_SIZE;

DIFFUSER_DOME_THICKNESS=GROOVE_WIDTH;
/**
* In case wooden dowel variance is too large, we can print precision dowels
* We design it in two halves that will be saved as a single STL file
*/
DOWEL_LENGTH_INCHES=1;
DOWEL_HALF_SPACING=7.5;


// ---- COMMERCIAL PART DIMENSIONS ----

// NeoPixel Board Information
// all units mm

/** Length of board short side */
BOARD_WIDTH = 12.698; 
/** Length of board long side */
BOARD_LENGTH = 17.8;        
/** Thickness of board */
BOARD_THICKNESS = 1.6;
/** Diameter of board mounting holes */    
MOUNTING_HOLE_DIAM = 3.3;   
/** Distance from the short side to the EDGE of the mounting hole */
SHORT_SIDE_TO_MOUNTING_HOLE = 0.889;
/** Distance from the long side to the EDGE of the mounting hole */
LONG_SIDE_TO_MOUNTING_HOLE = 0.889;



// heat set inserts information
// all units mm

/**
* Max Outer diameter.
* It appears that the heat set insert has a larger "cap" near the top and
* a smaller section neat the bottom
*
* @TODO:
* Research if the hole is supposed to be sized for the smaller outer diameter rather than the large one
*/
HEAT_SET_INSERTS_OUTER_DIAMETER=5.0;
/**
* The height of the insert. I am using M3x4 in this project
*/
HEAT_SET_INSERTS_HEIGHT=4.0;




// ---- DERIVED PARAMETERS  ----

/** The distance in between the CENTERS of the mounting posts */
MOUNTING_POST_DISTANCE=BOARD_LENGTH-2*SHORT_SIDE_TO_MOUNTING_HOLE-2*MOUNTING_HOLE_DIAM/2;

MOUNTING_POST_OUTERMOST_RADIUS=HEAT_SET_INSERTS_OUTER_DIAMETER/2+MOUNTING_POST_WALL_THICKNESS;

WIRING_CUTOUT_CENTER_X=MOUNTING_POST_OUTERMOST_RADIUS+WIRING_CUTOUT_EDGE_TO_MOUNTING_POST_EDGE+WIRING_CUTOUT_WIDTH/2;





// ---- HELPERS ----

/**
* Create a triangular plate with rounded corners
* @param {number} bigR - Distance from origin to center of the rounding cylinders
* @param {number} littleR - Radius of the rounding cylinders
* The cylinders are not inset which means the distance to the extreme point is larger than `bigR` by the amount `littleR`
* @param {number} thickness - Thickness of the plate
* @param {number} facets - Number of facets per cylinder
*/
module helper_triangle_plate(
    bigR,
    littleR,
    thickness,
    facets
){
    linear_extrude(height=thickness, center=true) {
        hull() {
            for (i = [0:2]) {
                angle = i * 120;
                translate([bigR * cos(angle), bigR * sin(angle)])
                    circle(r = littleR, $fn = facets);
            }
        }
    }
}

/**
* Create a hollow dome with a flat bottom
* This means the bottom is a ring
* The design ensures that this ring is symmetrical around the diameter
* @param {number} diameter - Diameter of the dome
* @param {number} wall_thickness -
Thickness of the dome wall, 
this means that at the base, which is a ring,
half of the thickness is inside the diameter and half is outside
* @param {number} facets-
*
* Controls the smoothness of the sphere
* OpenSCAD uses a polar sphere. 
* It uses faces formed by latitude and longitude lines.
* This parameter controls the number of longitude divisions.
* OpenSCAD automatically determines how many latitude divisions to use and where.
*/
module helper_dome_shell(
    diameter,
    wall_thickness,
    facets
){
    difference() {
        sphere(r=diameter/2 + wall_thickness/2, $fn=facets);  // Outer sphere
        sphere(r=diameter/2 - wall_thickness/2, $fn=facets);
        
        // Cut the bottom half to create a dome shape
        translate([0,0,-(diameter+wall_thickness)/2]) {
            cube([diameter+wall_thickness, diameter+wall_thickness, diameter+wall_thickness], center=true);
        }
    }
}

/**
* Creates a cylindrical annulus (a hollow ring) with specified dimensions.
* The annulus is centered at the origin in the XY plane.
* By default, the bottom of the annulus is at Z=0, but if `center=true`, it is centered along the Z-axis.
* If `height` is negative, the annulus is extruded downward instead of upward.
* The thickness of the annulus is distributed symmetrically about the diameter
*
* @param {number} diameter - Outer diameter of the annulus.
* @param {number} thickness - Thickness of the annulus wall (inner radius is `diameter/2 - thickness`).
* @param {number} height - Height of the annulus. 
* @param {bool} center - If true, the annulus is centered along the Z-axis; otherwise, its bottom is at Z=0.
* @param {number} facets - Controls the smoothness of the annulus by setting the number of circular divisions.
*/
module helper_annulus(diameter, thickness, height, facets=64) {
    outer_radius = diameter / 2+thickness/2;
    inner_radius = diameter/2 - thickness/2;
   

    difference() {
            cylinder(h=height, r=outer_radius, $fn=facets);
            translate([0, 0, -SOLVER_TOLERANCE])  // Slightly lower to ensure clean subtraction
            cylinder(h=height +SOLVER_TOLERANCE*2, r=inner_radius, $fn=facets);
    }
}

/**
* Create the box that occupies the space between two points
*
* Note, we need to first sort the points in case the corners have reverse polarity with respect to axes
* We want hte result to be a normal box despite either polarity
* An analogy might be the box selection tool in software such as Photoshop or GIMP
* @param {[number, number, number]} A - The first point
* @param {[number, number, number]} B - The second point
*/
module two_point_box(A, B) {
    // Determine the minimum and maximum coordinates along each axis.
    minPoint = [ min(A[0], B[0]), min(A[1], B[1]), min(A[2], B[2]) ];
    maxPoint = [ max(A[0], B[0]), max(A[1], B[1]), max(A[2], B[2]) ];
    
    // Calculate the size of the box in each dimension.
    sizeVec = [ maxPoint[0] - minPoint[0],
                maxPoint[1] - minPoint[1],
                maxPoint[2] - minPoint[2] ];
    
    // Create the box by translating to the minimum point.
    translate(minPoint)
        cube(sizeVec, center = false);
}

// ---- DESIGN -----

/**
* Main body of the fixture design -- a triangular plate with rounded corners
*/
module plate(){
    helper_triangle_plate(
        bigR=TRIANGLE_PLATE_SIZE,
        littleR=TRIANGLE_PLATE_ROUNDING_RADIUS,
        facets=FACETS_PER_CYLINDER,
        thickness=TRIANGLE_PLATE_THICKNESS
    );
}


/**
* Holes for wooden dowels for connecting sequences of fixtures
*/
module dowel_holes(){
    dowel_diameter_mm = DOWEL_DIAMETER_INCHES * 25.4;
    dowel_separator_plate_thickness = TRIANGLE_PLATE_THICKNESS - 2 * DOWEL_DEPTH;
    let(
        centers = [
            [cos(0) * TRIANGLE_PLATE_SIZE, sin(0) * TRIANGLE_PLATE_SIZE,0],
            [cos(120) * TRIANGLE_PLATE_SIZE, sin(120) * TRIANGLE_PLATE_SIZE,0],
            [cos(240) * TRIANGLE_PLATE_SIZE, sin(240) * TRIANGLE_PLATE_SIZE,0]
        ]
    ){
        for (i = [0 : len(centers)-1])
 
            translate(centers[i])
            difference(){
                cylinder(
                    h = TRIANGLE_PLATE_THICKNESS+SOLVER_TOLERANCE*2,
                    r = dowel_diameter_mm / 2 + (DOWEL_HOLE_DIAMETER_TOLERANCE/2),
                    center = true,
                    $fn=FACETS_PER_CYLINDER
                );
                cylinder(
                    h = dowel_separator_plate_thickness,
                    r = dowel_diameter_mm / 2 + (DOWEL_HOLE_DIAMETER_TOLERANCE/2),
                    center = true,
                    $fn=FACETS_PER_CYLINDER
                );
            }
    }
}

/**
* One of the two mounting posts in this design
* We specify the center point to differentiate between them
*
* @param {[number,number]} center2D -
* The center of the bottom face of the mounting post
*
*/
module mounting_post(center2D){
    // total_height = HEAT_SET_INSERTS_HEIGHT + MOUNTING_POST_FLOOR_HEIGHT;
    // difference(){
    //     translate([center2D[0], center2D[1],total_height/2+TRIANGLE_PLATE_THICKNESS/2]){
    //         cylinder(
    //             h=total_height,
    //             r=HEAT_SET_INSERTS_OUTER_DIAMETER/2+MOUNTING_POST_WALL_THICKNESS, center=true,                  
    //     $fn=FACETS_PER_CYLINDER
    //         );
    //     };
    //     translate([center2D[0], center2D[1],(total_height-MOUNTING_POST_FLOOR_HEIGHT+MOUNTING_POST_FLOOR_HEIGHT)/2+TRIANGLE_PLATE_THICKNESS/2+MOUNTING_POST_FLOOR_HEIGHT]){
    //         cylinder(
    //             h=total_height-MOUNTING_POST_FLOOR_HEIGHT+MOUNTING_POST_FLOOR_HEIGHT,
    //             r=HEAT_SET_INSERTS_OUTER_DIAMETER/2,
    //         center=true,                  
    //         $fn=FACETS_PER_CYLINDER
    //         );
    //     };
    // }
    translate([
        center2D[0],
        center2D[1],
        TRIANGLE_PLATE_THICKNESS/2-HEAT_SET_INSERTS_HEIGHT+MOUNTING_POST_FLOOR_HEIGHT
    ]){
        cylinder(h = HEAT_SET_INSERTS_HEIGHT+SOLVER_TOLERANCE, r = HEAT_SET_INSERTS_OUTER_DIAMETER/2,center=false, $fn=FACETS_PER_CYLINDER);
    }
}

/**
*  A cylindrical cutout to run wires through to exit the diffuser dome
*/
module wiring_cutout(){
    // translate([WIRING_CUTOUT_CENTER_X,0,0]){
    //     cylinder(
    //         h=TRIANGLE_PLATE_THICKNESS+2*SOLVER_TOLERANCE,
    //         r=WIRING_CUTOUT_DIAMETER/2,
    //         center=true,                  
    //         $fn=FACETS_PER_CYLINDER
    //     );
    // };
    two_point_box([
        WIRING_CUTOUT_CENTER_X+WIRING_CUTOUT_WIDTH/2,
        WIRING_CUTOUT_LENGTH/2,
        TRIANGLE_PLATE_THICKNESS/2+SOLVER_TOLERANCE
    ],[
        WIRING_CUTOUT_CENTER_X-WIRING_CUTOUT_WIDTH/2,
        -WIRING_CUTOUT_LENGTH/2,
        -TRIANGLE_PLATE_THICKNESS/2-SOLVER_TOLERANCE
    ]); 
}



/**
* A decently wide rectangular cutout the penetrates form the side all the way to the wiring cutout. 
* This allows the insertion fo pre-soldered items as opposed to having to mount all items first, then solder separately
*/
module insertion_channel(){
    two_point_box(A = [
        WIRING_CUTOUT_CENTER_X-INSERTION_CHANNEL_WIDTH/2,
        -INSERTION_CHANNEL_LENGTH,
        -TRIANGLE_PLATE_THICKNESS/2-SOLVER_TOLERANCE
    ], B = [
        WIRING_CUTOUT_CENTER_X+INSERTION_CHANNEL_WIDTH/2,
        0,
        TRIANGLE_PLATE_THICKNESS/2+SOLVER_TOLERANCE
    ]);
}

/**
 * A groove that the diffuser dome's tenon fits into.
 * This creates a circular groove (or “rabbet”) cut from the top surface of the plate.
 * The groove is defined by a centerline circle of diameter GROOVE_DIAMETER.
 * Its width is symmetric around that circle—each side extending by half of the effective width,
 * where the effective width is (GROOVE_WIDTH + GROOVE_WIDTH_TOLERANCE).
 * The groove is cut from the top surface down by the effective depth, which is (GROOVE_DEPTH + GROOVE_DEPTH_TOLERANCE).
 */
module diffuser_attachment_groove() {
    // Compute effective parameters
    effective_width = GROOVE_WIDTH + GROOVE_WIDTH_TOLERANCE;
    effective_depth = GROOVE_DEPTH + GROOVE_DEPTH_TOLERANCE;
    
    // Calculate the outer and inner radii of the groove.
    // The centerline of the groove is a circle of radius = GROOVE_DIAMETER/2.
    // The groove extends outward and inward by half the effective width.
    outer_r = GROOVE_DIAMETER/2 + effective_width/2;
    inner_r = GROOVE_DIAMETER/2 - effective_width/2;
    
    // Position the groove so that its top face is flush with the plate’s top surface.
    // Since the plate is centered (z = ±TRIANGLE_PLATE_THICKNESS/2),
    // we translate downward by the groove depth.
    translate([0, 0, TRIANGLE_PLATE_THICKNESS/2 - effective_depth])
        linear_extrude(height = effective_depth+SOLVER_TOLERANCE)
            difference() {
                // The outer circle defines the full extent of the groove.
                circle(r = outer_r, $fn = GROOVE_FACETS);
                // Subtract the inner circle to leave a ring-shaped (annular) groove.
                circle(r = inner_r, $fn = GROOVE_FACETS);
            }
}

module triangle_weight_reduction(){
    translate([
        0,0,-TRIANGLE_PLATE_THICKNESS/2+TRIANGLE_WEIGHT_REDUCTION_THICKNESS/2-SOLVER_TOLERANCE
    ])
    helper_triangle_plate(
    bigR = TRIANGLE_WEIGHT_REDUCTION_PLATE_SIZE,
    littleR = TRIANGLE_PLATE_ROUNDING_RADIUS,
    thickness = TRIANGLE_WEIGHT_REDUCTION_THICKNESS+SOLVER_TOLERANCE,
    facets = FACETS_PER_CYLINDER);
}


module triangle_assembly(){
    difference(){
        plate();
        dowel_holes();
        wiring_cutout();
        diffuser_attachment_groove();
        insertion_channel();
        mounting_post([0,MOUNTING_POST_DISTANCE/2]);
        mounting_post([0,-MOUNTING_POST_DISTANCE/2]);
        triangle_weight_reduction();
    }

}

module diffuser_assembly(){
    translate([
        0,0,TRIANGLE_PLATE_THICKNESS/2
    ]){
        // The groove is already toleranced. We don't separately tolerance the tenon
        helper_dome_shell(diameter = GROOVE_DIAMETER, wall_thickness = DIFFUSER_DOME_THICKNESS, facets = GROOVE_FACETS);
        translate(
            [0,0,-GROOVE_DEPTH-GROOVE_DEPTH_TOLERANCE]
        )
        helper_annulus(
        diameter = GROOVE_DIAMETER,
        thickness = GROOVE_WIDTH,
        height = GROOVE_DEPTH-GROOVE_DEPTH_TOLERANCE,
        facets=GROOVE_FACETS
        );
    }
}

// @export triangle
color("blue")
triangle_assembly();

// @export diffuser
color("white")
diffuser_assembly();



