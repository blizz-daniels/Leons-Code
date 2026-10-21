# Phase 4 supported Java subset

Phase 4 adds interactive program input and a small, explicit standard-library bridge to the executable subset from Phase 3.

## Input

`new Scanner(System.in)` is supported inside methods. The program input panel supplies values only when execution requests them. Supported calls are `next`, `nextLine`, `nextInt`, `nextLong`, `nextDouble`, `nextFloat`, `nextBoolean`, `hasNext`, and `close`.

Input is tokenized like a simple Java `Scanner`: token methods skip whitespace and `nextLine` reads the remainder of the current line. Invalid numeric or boolean input reports an `InputMismatchException`-style runtime error.

## Arrays, strings, math, and exceptions

- Typed array declarations, array initializers, indexing, lengths, and enhanced `for` loops are checked and translated.
- `String` supports `equals`, `length`, `contains`, `charAt`, `substring`, `toUpperCase`, and `toLowerCase`.
- The supported `Math` bridge exposes `abs`, `ceil`, `cos`, `floor`, `max`, `min`, `pow`, `random`, `round`, `sin`, `sqrt`, `PI`, and `E`.
- `try`/`catch`/`finally`, `throw`, and the documented exception names are translated to controlled JavaScript errors.

## Boundaries

This remains a learning subset rather than a Java Virtual Machine. It does not provide files, networking, reflection, threads, arbitrary library imports, overload resolution, or full JDK compatibility. Programs execute in a sandboxed iframe with a time and output limit.
