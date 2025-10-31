// Reverses a list of points by index access manipulation
// Since in this version of OpenSCAD, reverse is not supported
function reversed(points) = 
    let(n = len(points))
    [ for (i = [0 : n - 1]) points[n - 1 - i] ];

// Uses indexes and conditional logic to combine A and B since
// at times concat acts funny especially when nested
function combined(A, B) = 
    let(
        na = len(A),
        nb = len(B),
        total = na + nb
    )
    [ for (i = [0 : total - 1]) 
        i < na ? A[i] : B[i - na]
    ];

// Adds a 2D offset to each point in a list (makes copy)
function add2DOffset(points, offset) =
    [for (p = points) [p[0] + offset[0], p[1] + offset[1]]];

// Adds a 3D offset to each point in a list (makes copy)
function add3DOffset(points, offset) =
    [for (p = points) [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]]];

// Creates a box that spans the space between two points, point-order independent
// Regardless of point position, the output is always a positive volume.
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

// Get the y coordinate corresponding to a given x coordinate in the boundary of a circle in the first quadrant
function height_at_x_for_circle(r, x) =  sqrt(r*r - x*x);

// Normalize a 3d vector, unless length is 0, then return [0,0,0]
function normalize3d(v) = 
    let (len = norm(v))
    len == 0 ? [0, 0, 0] : [v[0]/len, v[1]/len, v[2]/len];

// Normalize a 2d vector, unless length is 0, then return [0,0]
function normalize2d(v) = 
    let (len = norm(v))
    len == 0 ? [0, 0] : [v[0]/len, v[1]/len];
    
// Find the 2d vector that is at a 90 degree angle from a given vector, in the counter-clockwise direction
function orthogonal2D(v) = [-v[1], v[0]];

// Transform a 2D vector onto a new coordinate system given its basis vectors
function transformToBasis2D(v, basis0, basis1) =
    [
        v[0] * basis0[0] + v[1] * basis1[0],
        v[0] * basis0[1] + v[1] * basis1[1]
    ];

// Transform each point in a list of points to a new coordinate system given the basis vectors
function transformPointsToBasis2D(points, basis0, basis1) =
    [ for (pt = points) transformToBasis2D(pt, basis0, basis1) ];

// Take a profile in the first quadrant of the x-z plane and rotate-extrude it for a 
// given number of degrees and with the given number of facets
module rotate_extrude_x(profile_points, degrees=360, facets=64) {
    transformed_points = [ for (p = profile_points) [-p[1], p[0] ] ];
    rotate([0, 90, 0])
        rotate_extrude($fn=facets, degrees=degrees)
            polygon(points = transformed_points);
}


module two_point_box(A, B) {
    // Ensure A and B are 3D vectors
    assert(len(A) == 3 && len(B) == 3, "A and B must be 3D vectors");

    // Compute the minimum and maximum for each coordinate
    min_pt = [min(A[0], B[0]), min(A[1], B[1]), min(A[2], B[2])];
    max_pt = [max(A[0], B[0]), max(A[1], B[1]), max(A[2], B[2])];

    // Compute the size of the box
    size = [
        max_pt[0] - min_pt[0],
        max_pt[1] - min_pt[1],
        max_pt[2] - min_pt[2]
    ];

    // Translate to the minimum corner and draw the cube
    translate(min_pt)
        cube(size, center = false);
}

// two_point_cylinder.scad (v2)
// Place a cylinder so its endcap centers lie on p0 and p1.
//
// p0, p1 : 3D points [x,y,z] giving the exact endcap center positions
// d      : cylinder diameter
// extra0 : extra length added *behind p0* along the -local-Z direction (toward p0 side)
// extra1 : extra length added *past p1* along the +local-Z direction (toward p1 side)
// $fn    : facet count (optional)
//
// Notes:
// - Set extra0=0, extra1>0 to "push through" past p1 only (typical flush-cut boolean).
// - Set extra1=0, extra0>0 to extend only behind p0.
// - If you want symmetric overcut, set extra0=extra1=h_extra.
//
module two_point_cylinder(p0, p1, d, extra0=0, extra1=0, $fn=48) {
    // Small numeric helpers
    function _clamp(x, a, b) = min(max(x, a), b);
    EPS = 1e-9;

    // Vector math
    v   = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]];
    h0  = norm(v);
    dir = (h0 < EPS) ? [0,0,1] : [v[0]/h0, v[1]/h0, v[2]/h0];

    // Angle from +Z (OpenSCAD trig uses degrees)
    ez   = [0,0,1];
    cang = _clamp(dir[2], -1, 1);
    ang  = acos(cang);

    // Safe rotation axis (handle near-parallel cases)
    cr = cross(ez, dir);
    ax = (ang < EPS) ? [1,0,0] :
         (abs(ang-180) < EPS ? [1,0,0] :
          (norm(cr) < EPS ? [1,0,0] : cr));

    // Total height including asymmetric overcuts
    h = h0 + extra0 + extra1;

    // Build: position at p0, rotate onto segment,
    // then shift back by extra0 so the "nominal" span stays p0..p1
    translate(p0)
        rotate(a=ang, v=ax)
            translate([0,0,-extra0])
                cylinder(h=h, d=d, $fn=$fn);
}

// Convenience symmetric wrapper (optional)
module two_point_cylinder_sym(p0, p1, d, h_extra=0, $fn=48) {
    two_point_cylinder(p0, p1, d, extra0=h_extra/2, extra1=h_extra/2, $fn=$fn);
}

