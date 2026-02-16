import type { ScadSymbol } from "./scadLspProtocol";

function builtin(
  name: string,
  kind: ScadSymbol["kind"],
  parameters: string[] = []
): ScadSymbol {
  return {
    name,
    kind,
    parameters,
    startLine: -1,
    startColumn: -1,
    endLine: -1,
    endColumn: -1,
  };
}

/** Built-in OpenSCAD 3D/2D modules. */
export const BUILTIN_MODULES: ScadSymbol[] = [
  // 3D primitives
  builtin("cube", "module", ["size", "center"]),
  builtin("sphere", "module", ["r", "d"]),
  builtin("cylinder", "module", ["h", "r", "r1", "r2", "d", "d1", "d2", "center"]),
  builtin("polyhedron", "module", ["points", "faces", "convexity"]),

  // 2D primitives
  builtin("circle", "module", ["r", "d"]),
  builtin("square", "module", ["size", "center"]),
  builtin("polygon", "module", ["points", "paths", "convexity"]),
  builtin("text", "module", ["text", "size", "font", "halign", "valign", "spacing", "direction", "language", "script"]),

  // Transformations
  builtin("translate", "module", ["v"]),
  builtin("rotate", "module", ["a", "v"]),
  builtin("scale", "module", ["v"]),
  builtin("resize", "module", ["newsize", "auto"]),
  builtin("mirror", "module", ["v"]),
  builtin("multmatrix", "module", ["m"]),
  builtin("color", "module", ["c", "alpha"]),
  builtin("offset", "module", ["r", "delta", "chamfer"]),

  // Boolean operations
  builtin("union", "module"),
  builtin("difference", "module"),
  builtin("intersection", "module"),

  // Extrusion
  builtin("linear_extrude", "module", ["height", "center", "convexity", "twist", "slices", "scale"]),
  builtin("rotate_extrude", "module", ["angle", "convexity"]),

  // Other modules
  builtin("hull", "module"),
  builtin("minkowski", "module"),
  builtin("import", "module", ["file", "convexity"]),
  builtin("surface", "module", ["file", "center", "convexity"]),
  builtin("projection", "module", ["cut"]),
  builtin("render", "module", ["convexity"]),
  builtin("children", "module", ["index"]),

  // Control
  builtin("echo", "module"),
  builtin("for", "module"),
  builtin("intersection_for", "module"),
  builtin("if", "module"),
  builtin("let", "module"),
  builtin("assign", "module"),
];

/** Built-in OpenSCAD functions. */
export const BUILTIN_FUNCTIONS: ScadSymbol[] = [
  // Math
  builtin("abs", "function", ["x"]),
  builtin("sign", "function", ["x"]),
  builtin("sin", "function", ["x"]),
  builtin("cos", "function", ["x"]),
  builtin("tan", "function", ["x"]),
  builtin("acos", "function", ["x"]),
  builtin("asin", "function", ["x"]),
  builtin("atan", "function", ["x"]),
  builtin("atan2", "function", ["y", "x"]),
  builtin("floor", "function", ["x"]),
  builtin("ceil", "function", ["x"]),
  builtin("round", "function", ["x"]),
  builtin("ln", "function", ["x"]),
  builtin("log", "function", ["x"]),
  builtin("pow", "function", ["base", "exponent"]),
  builtin("sqrt", "function", ["x"]),
  builtin("exp", "function", ["x"]),
  builtin("min", "function", ["a", "b"]),
  builtin("max", "function", ["a", "b"]),
  builtin("norm", "function", ["v"]),
  builtin("cross", "function", ["a", "b"]),

  // String / list
  builtin("len", "function", ["v"]),
  builtin("str", "function", ["values"]),
  builtin("chr", "function", ["x"]),
  builtin("ord", "function", ["x"]),
  builtin("concat", "function", ["args"]),
  builtin("lookup", "function", ["key", "table"]),
  builtin("search", "function", ["match", "string_or_vector", "num_returns_per_match", "index_col_num"]),

  // Type checking
  builtin("is_undef", "function", ["x"]),
  builtin("is_bool", "function", ["x"]),
  builtin("is_num", "function", ["x"]),
  builtin("is_string", "function", ["x"]),
  builtin("is_list", "function", ["x"]),
  builtin("is_function", "function", ["x"]),

  // Other
  builtin("version", "function"),
  builtin("version_num", "function"),
  builtin("parent_module", "function", ["idx"]),
  builtin("assert", "function", ["condition", "message"]),
  builtin("each", "function", ["list"]),
];

/** Built-in OpenSCAD special variables. */
export const BUILTIN_VARIABLES: ScadSymbol[] = [
  builtin("$fn", "variable"),
  builtin("$fa", "variable"),
  builtin("$fs", "variable"),
  builtin("$t", "variable"),
  builtin("$children", "variable"),
  builtin("$preview", "variable"),
  builtin("$vpr", "variable"),
  builtin("$vpt", "variable"),
  builtin("$vpd", "variable"),
  builtin("$vpf", "variable"),
  builtin("PI", "variable"),
];

export const ALL_BUILTINS: ScadSymbol[] = [
  ...BUILTIN_MODULES,
  ...BUILTIN_FUNCTIONS,
  ...BUILTIN_VARIABLES,
];
