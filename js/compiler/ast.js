export function createNode(type, start, end, properties = {}) {
  return {
    type,
    ...properties,
    loc: { start: pointFrom(start), end: pointFrom(end?.loc?.end || end || start) },
  };
}

export function pointFrom(tokenOrPoint) {
  if (!tokenOrPoint) return { line: 1, column: 1, offset: 0 };
  if (tokenOrPoint.loc) return pointFrom(tokenOrPoint.loc.start);
  if (tokenOrPoint.start) return pointFrom(tokenOrPoint.start);
  return {
    line: tokenOrPoint.line,
    column: tokenOrPoint.column,
    offset: tokenOrPoint.offset,
  };
}

export function endFrom(token) {
  return token?.end || token?.start || token;
}

