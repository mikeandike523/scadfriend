// Vector operations (works for 2D or 3D points)
function vec_add(a, b) = [ for (i = [0 : len(a)-1]) a[i] + b[i] ];
function vec_sub(a, b) = [ for (i = [0 : len(a)-1]) a[i] - b[i] ];
function vec_scale(a, s) = [ for (i = [0 : len(a)-1]) a[i] * s ];

// Hermite interpolation between p1 and p2 with tangents m1 and m2
function hermite(p1, p2, m1, m2, t) = let(
    h1 =  2*t*t*t - 3*t*t   + 1,
    h2 = -2*t*t*t + 3*t*t,
    h3 =    t*t*t - 2*t*t + t,
    h4 =    t*t*t -   t*t
) vec_add(
    vec_add( vec_scale(p1, h1), vec_scale(p2, h2) ),
    vec_add( vec_scale(m1, h3), vec_scale(m2, h4) )
);

// Linear interpolation between p0 and p1 into Ni points
function interp_line(p0, p1, Ni) = [
    for (i = [0 : max(1, Ni)-1]) let(t = i / (max(1, Ni)-1)) vec_add(vec_scale(p0, 1-t), vec_scale(p1, t))
];

// Quadratic (Bezier) interpolation for three points into Ni points
function interp_quad(p0, p1, p2, Ni) = [
    for (i = [0 : max(1, Ni)-1]) let(t = i / (max(1, Ni)-1))
        vec_add(
            vec_add(
                vec_scale(p0, (1-t)*(1-t)),
                vec_scale(p1, 2*(1-t)*t)
            ),
            vec_scale(p2, t*t)
        )
];

// Main spline function
// ctrl: array of control points (each a vector of length 2 or 3)
// Ni: number of points (or points per segment if more than 3 control points)
// tension: 0 = Catmull-Rom
function spline(ctrl, Ni = 10, tension = 0) =
    let(Nc = len(ctrl))
    Nc < 3 ?  // handle 0,1,2 the same as before
        (Nc == 0 ? [] : Nc == 1 ? [ctrl[0]] : interp_line(ctrl[0], ctrl[1], Ni)) :
    Nc == 3 ?
        interp_quad(ctrl[0], ctrl[1], ctrl[2], Ni) :
    // Nc > 3:
    let(
        NiSeg = max(2, Ni),
        ext   = concat([ctrl[0]], ctrl, [ctrl[Nc-1]])
    )
    [   // <--- single list, but two for‐clauses flatten:
        for (i = [0 : Nc-2])
            for (j = (i == 0 ? [0 : NiSeg-1] : [1 : NiSeg-1]))
                let(
                    p1 = ext[i+1],
                    p2 = ext[i+2],
                    m1 = vec_scale(vec_sub(ext[i+2], ext[i]),   (1 - tension)/2),
                    m2 = vec_scale(vec_sub(ext[i+3], ext[i+1]), (1 - tension)/2)
                )
                hermite(p1, p2, m1, m2, j/(NiSeg-1))
    ];
