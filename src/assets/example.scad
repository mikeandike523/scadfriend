// ---- HELPER FUNCTIONS AND MODULES ----

function height_at_x_for_circle(r, x) =  sqrt(r*r - x*x);

function normalize3d(v) = 
    let (len = norm(v))
    len == 0 ? [0, 0, 0] : [v[0]/len, v[1]/len, v[2]/len];

function normalize2d(v) = 
    let (len = norm(v))
    len == 0 ? [0, 0] : [v[0]/len, v[1]/len];

function orthogonal2D(v) = [-v[1], v[0]];

function transformToBasis2D(v, basis0, basis1) =
    [
        v[0] * basis0[0] + v[1] * basis1[0],
        v[0] * basis0[1] + v[1] * basis1[1]
    ];

function transformPointsToBasis2D(points, basis0, basis1) =
    [ for (pt = points) transformToBasis2D(pt, basis0, basis1) ];

module rotate_extrude_x(profile_points) {
    transformed_points = [ for (p = profile_points) [-p[1], p[0] ] ];
    rotate([0, 90, 0])
        rotate_extrude($fn=64)
            polygon(points = transformed_points);
}

function add2DOffset(points, offset) =
    [for (p = points) [p[0] + offset[0], p[1] + offset[1]]];

module two_point_box(A, B){

    x_min = min(A[0], B[0]);
    y_min = min(A[1], B[1]);
    z_min = min(A[2], B[2]);
    
    x_max = max(A[0], B[0]);
    y_max = max(A[1], B[1]);
    z_max = max(A[2], B[2]);
    
    width = x_max - x_min;
    depth = y_max - y_min;
    height = z_max - z_min;
    
    translate([x_min, y_min, z_min])
        cube([width, depth, height]);
}

// ---- DESIGN SPECIFIC HELPER FUNCTIONS AND MODULES ----


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

// ---- DESIGN PARAMETERS ----

EYE_DIAMETER = 24;
SCLERA_THICKNESS = 0.75;
SCLERA_ELONGATED_PORTION_START=4;
SCLERA_ELONGATED_PORTION_LENGTH=4;
SCLERA_OPENING_OUTER_DIAMETER=18;

sclera_elongated_portion_thickness=
    height_at_x_for_circle(
        r=EYE_DIAMETER/2,
        x=SCLERA_ELONGATED_PORTION_START
    ) -
    height_at_x_for_circle(
        r=EYE_DIAMETER/2-SCLERA_THICKNESS,
        x=SCLERA_ELONGATED_PORTION_START
    );

CHOROID_THICKNESS=0.250;
CHOROID_ELONGATED_PORTION_START=SCLERA_ELONGATED_PORTION_START;
CHOROID_ELONGATED_PORTION_LENGTH=3;

CILIARY_BODY_LENGTH_ALONG_BASIS_0 = 1.5;

// x = fraction along ciliary body region along basis 0
// y = proportion of choroid thicknesses along basis 1
CILIARY_BODY_PROFILE_PROPORTION=[
    [0,0],
    [1,0],
    [0.7,2.5],
    [0.3,3.5]
];

LENS_DIAMETER=10;
LENS_THICKNESS=4;



// x = fraction of lens radius from center (a.k.a. 'r')
// y= fraction of half of the thickness from center (a.k.a 'h')
LENS_FRONT_PROFILE = [
    [0.0, 1.0],
    [0.4, 0.95],
    [0.6, 0.8],
    [0.8,0.6],
    [0.9,0.4],
    [1, 0]
];

LENS_BACKSIDE_SCALE = 1.2;

LENS_X=5.95;



// ---- DERIVED PARAMETERS ----

sclera_slope=(height_at_x_for_circle(
    r=EYE_DIAMETER/2,
    x=SCLERA_ELONGATED_PORTION_START
    )-SCLERA_OPENING_OUTER_DIAMETER/2)/(
        SCLERA_ELONGATED_PORTION_LENGTH
    );

choroid_opening_outer_diameter=(height_at_x_for_circle(
    r=EYE_DIAMETER/2,
    x=SCLERA_ELONGATED_PORTION_START
    )-sclera_elongated_portion_thickness-sclera_slope*CHOROID_ELONGATED_PORTION_LENGTH)*2;

choroid_enlongated_portion_thickness =
(
    height_at_x_for_circle(
        r=EYE_DIAMETER/2-SCLERA_THICKNESS,
        x=CHOROID_ELONGATED_PORTION_START
    )
) - (
    height_at_x_for_circle(
        r=EYE_DIAMETER/2-SCLERA_THICKNESS-CHOROID_THICKNESS,
        x=CHOROID_ELONGATED_PORTION_START
    )
);

ciliary_body_profile_basis_0 = normalize2d([
    1, -sclera_slope
]);

ciliary_body_profile_basis_1 = -orthogonal2D(ciliary_body_profile_basis_0);

ciliary_body_profile_origin=[
    CHOROID_ELONGATED_PORTION_START+CHOROID_ELONGATED_PORTION_LENGTH-CILIARY_BODY_LENGTH_ALONG_BASIS_0*ciliary_body_profile_basis_0[0],
    choroid_opening_outer_diameter/2-choroid_enlongated_portion_thickness - CILIARY_BODY_LENGTH_ALONG_BASIS_0*ciliary_body_profile_basis_0[1]
];

ciliary_body_profile = 
add2DOffset(
    transformPointsToBasis2D(
        CILIARY_BODY_PROFILE_PROPORTION
    ,
    CILIARY_BODY_LENGTH_ALONG_BASIS_0 *
    ciliary_body_profile_basis_0
        ,
    choroid_enlongated_portion_thickness*ciliary_body_profile_basis_1
    ,)
,
    ciliary_body_profile_origin
);

// Parameters for real-world scaling
lens_radius = LENS_DIAMETER / 2;

// Scale normalized points to real-world size
function arrange_lens_profile(profile) = 
    [ for (pt = profile) [ pt[1] * (LENS_THICKNESS / 2),pt[0] * lens_radius] ];


// Compute the reversed and transformed backside profile
lense_back_profile = [
    for (i = [len(LENS_FRONT_PROFILE)-1 : -1 : 0])
        [LENS_FRONT_PROFILE[i][0], -LENS_FRONT_PROFILE[i][1] * LENS_BACKSIDE_SCALE]
];

lens_profile=concat(
    LENS_FRONT_PROFILE, lense_back_profile
);



// Generate the final scaled and mirrored profile
lens_world_profile = arrange_lens_profile(lens_profile);

// ---- DESIGN PARTS ----

module sclera(){
    elongated_ball(
        inner_radius=EYE_DIAMETER/2-SCLERA_THICKNESS,
        outer_radius=EYE_DIAMETER/2,
        elongation_start=SCLERA_ELONGATED_PORTION_START,
        elongation_length=SCLERA_ELONGATED_PORTION_LENGTH,
        opening_outer_radius=SCLERA_OPENING_OUTER_DIAMETER/2
    );
}

module choroid(){
    elongated_ball(
        inner_radius=EYE_DIAMETER/2-SCLERA_THICKNESS-CHOROID_THICKNESS,
        outer_radius=EYE_DIAMETER/2-SCLERA_THICKNESS,
        elongation_start=CHOROID_ELONGATED_PORTION_START,
        elongation_length=CHOROID_ELONGATED_PORTION_LENGTH,
        opening_outer_radius=choroid_opening_outer_diameter/2
    );
}

module ciliary_body(){
    rotate_extrude_x(
        ciliary_body_profile
    );
}

module lens(){
    rotate_extrude_x(
        add2DOffset(
            lens_world_profile
        ,[
       LENS_X,
       0])
    );
}

module cut_box(){
    two_point_box([
        -100,
        -100,
        -100
    ],[
        100,
        0,
        100
    ]);
}

module sclera_cut(){
    difference(){
        sclera();
        cut_box();
    }
}

module choroid_cut(){
    difference(){
        choroid();
        cut_box();
    }
}

module ciliary_body_cut(){
    difference(){
        ciliary_body();
        cut_box();
    }
}

module lens_cut(){
    difference(){
        lens();
        cut_box();
    }
}

// ---- DESIGN PART EXPORTS ----

// @export sclera-cut
color("rgb(255,255,255)")
sclera_cut();

// @export choroid-cut
color("rgb(255,0,0)")
choroid_cut();

// @export ciliary-body-cut
color("rgb(255,100,100)")
ciliary_body_cut();

// @export lens-cut
color("rgb(222, 209, 164)")
lens_cut();