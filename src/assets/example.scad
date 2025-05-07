// ---- External Libraries ----

use </SFLibs/spline.scad>;
use </SFLibs/core.scad>;

// ---- HELPER FUNCTIONS AND MODULES ----


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

FIBERS_THICKNESS_OUTER = 0.45;
FIBERS_THICKNESS_INNER = 1.6;
FIBERS_DENT=-0.25;
FIBERS_DIAMETER=17;
FIBERS_X = 5.7;

IRIS_PROFILE=[
    [3.75,0],
    [3.25,4],
    [2.75, 6],
    [1, 8],
    [1.5, 8.35],
    [2.15, 7.6],
    [3, 6.6],
    [4, 5],
    [4.5,3.8],
    [5.25,2.25],
    [4.9,1.85],
    [4.9,0]
];
IRIS_X = 5.5;
IRIS_SCALE_R=1.05;
IRIS_SCALE_H=1.0;
PUPIL_DIAMETER=3;

// x (offset from opening start), y as a fraction of sclera outer diameter at opening
CORNEA_OUTER_PROFILE_CTRL=[
    [

    ],
];

// x (offset form opening start), y as a fraction of sclera
// inner diameter at opening
CORNEA_INNER_PROFILE_CTRL=[
];

CORNEA_THICKNESS=0.5;

// ---- DERIVED PARAMETERS ----


sclera_elongated_portion_thickness=
    height_at_x_for_circle(
        r=EYE_DIAMETER/2,
        x=SCLERA_ELONGATED_PORTION_START
    ) -
    height_at_x_for_circle(
        r=EYE_DIAMETER/2-SCLERA_THICKNESS,
        x=SCLERA_ELONGATED_PORTION_START
    );

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

lens_world_profile = arrange_lens_profile(lens_profile);

fibers_profile = [
    [FIBERS_DENT, 0],
    [0, FIBERS_DIAMETER/2],
    [FIBERS_THICKNESS_OUTER, FIBERS_DIAMETER/2],
    [FIBERS_DENT+FIBERS_THICKNESS_INNER, 0]
];


fibers_world_profile = add2DOffset(fibers_profile, [FIBERS_X, 0]);

cornea_x = SCLERA_ELONGATED_PORTION_START + SCLERA_ELONGATED_PORTION_LENGTH;




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

module fibers(){
    difference(){
        translate([FIBERS_X, 0,0])
        rotate_extrude_x(fibers_profile);
        ciliary_body();
        lens();
    }
}

module iris(){
    difference(){
        translate([IRIS_X,0,0])
            scale([IRIS_SCALE_H,IRIS_SCALE_R, IRIS_SCALE_R])
                difference(){
                    rotate_extrude_x(IRIS_PROFILE);
                    rotate_extrude_x([
                        [-10,0],
                        [-10, PUPIL_DIAMETER/2],
                        [10, PUPIL_DIAMETER/2],
                        [10, 0],
                    ]);            
                }
        sclera();
        choroid();
        ciliary_body();
        
    }

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

module fibers_cut(){
    difference(){
        fibers();
        cut_box();
    };
}

module iris_cut(){
    difference(){
        iris();
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

// @export fibers-cut
color("rgb(125, 125,244)")
fibers_cut();

// @export iris-cut
color("rgb(244,233,158)")
iris_cut();