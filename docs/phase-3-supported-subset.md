# Phase 3 supported Java subset

JavaLab now parses, checks, translates, and runs a documented educational subset of Java.

Supported in the executable path:

- Classes, fields, constructors, instance methods, static methods, and single-class inheritance.
- `public static void main(String[] args)` as the program entry point.
- Primitive numeric values, booleans, characters, strings, arrays, arithmetic, comparisons, and Java-style integer division.
- Variable declarations, assignments, `if`/`else`, `switch`, `for`, enhanced `for` over arrays, `while`, `do`/`while`, `break`, `continue`, and `return`.
- `System.out` / `System.err` print methods, a small `Math` bridge, `String.equals`, and selected Java-style string operations.
- Parse and semantic diagnostics for malformed syntax, undefined names, incompatible assignments, invalid conditions, duplicate declarations, and selected call errors.

Execution happens in a sandboxed, opaque-origin iframe with a strict inline content-security policy. The parent UI validates session-scoped messages, enforces a wall-clock execution limit, removes the iframe on Stop or timeout, and limits output. This isolates student code from the JavaLab document but is not a claim of a complete security boundary against every browser-level risk.

Current limitations:

- No Scanner or interactive input yet; that is Phase 4.
- Generics, annotations, lambdas, interfaces at runtime, method overloading, and most of the Java standard library are not implemented.
- The analyzer covers the executable subset, not the entire Java type system.
- `try` / `catch` syntax is translated but is intentionally not presented as full Java exception compatibility.

