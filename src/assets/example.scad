// The Human Eye - Patient's Right Eye

// Item 1: Sclera

// The "outer sheath" of the eye

// The eye is not perfectly spherical, it is elongated

// To model this, well keep it simple

// First, let's omit the optic nerve for now, we intend to project texture on to the back of the eye anyway

// So let's make the back half a sphere, and the front half a truncated cone. It is a "skin" so we may be able to achieve this

// by differencing a scaled down version of the geometry

// we can stick loosely to real world sizes for simplicity of design

// All units are in mm

// Anatomical directions for RIGHT EYE
// ANTERIOR: +x (front of eye)
// POSTERIOR: -x (back of eye)
// SUPERIOR: +z (top of eye)
// INFERIOR: -z (bottom of eye)
// TEMPORAL: -y (towards temple/ear - patient's right side)
// NASAL: +y (towards nose - patient's left side)
// Eye dimensions based on average adult human eye
EYE_DIAMETER = 24;  // Diameter of the eye in mm
SCLERA_THICKNESS = 1;  // Thickness of the sclera wall
CORNEA_DIAMETER = 12;  // Diameter of the cornea (front part)
CORNEA_HEIGHT = 2.5;   // How much the cornea protrudes
IS_RIGHT_EYE = true;   // Set to false for left eye

// Derived values
EYE_RADIUS = EYE_DIAMETER / 2;
CORNEA_RADIUS = CORNEA_DIAMETER / 2;

module sclera() {
    // Rotate the entire model to align with anatomical directions
    // This rotates from default OpenSCAD orientation to our medical orientation
    rotate([0, -90, 0]) 
    // Mirror if it's a left eye
    if (!IS_RIGHT_EYE) {
        mirror([0, 1, 0])
        sclera_body();
    } else {
        sclera_body();
    }
}

module sclera_body() {
    difference() {
        union() {
            // Back hemisphere of the eye (sclera) - posterior segment
            difference() {
                sphere(r = EYE_RADIUS);
                translate([0, 0, -EYE_RADIUS])
                    cube([EYE_DIAMETER * 2, EYE_DIAMETER * 2, EYE_DIAMETER], center = true);
                translate([0, 0, EYE_RADIUS - CORNEA_HEIGHT])
                    cylinder(h = CORNEA_HEIGHT + 1, r = CORNEA_RADIUS, center = false);
            }

            // Corneal bulge (front part that's more curved) - anterior segment
            translate([0, 0, EYE_RADIUS - CORNEA_HEIGHT])
                intersection() {
                    sphere(r = CORNEA_RADIUS + CORNEA_HEIGHT);
                    translate([0, 0, CORNEA_HEIGHT/2])
                        cylinder(h = CORNEA_HEIGHT, r = CORNEA_RADIUS, center = true);
                }
        }

        // Hollow out the inside by creating a smaller version
        scale([
            (EYE_RADIUS - SCLERA_THICKNESS) / EYE_RADIUS,
            (EYE_RADIUS - SCLERA_THICKNESS) / EYE_RADIUS,
            (EYE_RADIUS - SCLERA_THICKNESS) / EYE_RADIUS
        ])
            sphere(r = EYE_RADIUS);
    }
}

// Render the sclera
// @export sclera
color("white")
sclera();