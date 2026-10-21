export class JavaScanner {
  constructor(requestInput) {
    this.requestInput = requestInput;
    this.buffer = "";
    this.position = 0;
    this.closed = false;
  }

  async next() {
    await this.ensureToken();
    const token = this.readToken();
    if (token === null) throw inputMismatch("No token is available.");
    return token;
  }

  async nextLine() {
    await this.ensureLine();
    if (this.position >= this.buffer.length) return "";
    const end = this.findLineEnd();
    const value = this.buffer.slice(this.position, end);
    this.position = end;
    if (this.buffer[this.position] === "\r") this.position += 1;
    if (this.buffer[this.position] === "\n") this.position += 1;
    return value;
  }

  async nextInt() {
    const value = await this.next();
    if (!/^[+-]?\d+$/.test(value)) throw inputMismatch(`'${value}' is not an int.`);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < -2_147_483_648 || number > 2_147_483_647) throw inputMismatch(`'${value}' is outside the int range.`);
    return number | 0;
  }

  async nextLong() {
    const value = await this.next();
    if (!/^[+-]?\d+$/.test(value)) throw inputMismatch(`'${value}' is not a long.`);
    return Number(value);
  }

  async nextDouble() {
    const value = await this.next();
    const number = Number(value);
    if (!Number.isFinite(number)) throw inputMismatch(`'${value}' is not a double.`);
    return number;
  }

  async nextFloat() {
    return this.nextDouble();
  }

  async nextBoolean() {
    const value = (await this.next()).toLowerCase();
    if (value !== "true" && value !== "false") throw inputMismatch(`'${value}' is not a boolean.`);
    return value === "true";
  }

  async hasNext() {
    await this.ensureToken();
    return this.readToken(false) !== null;
  }

  close() {
    this.closed = true;
  }

  async ensureToken() {
    this.skipWhitespace();
    while (this.position >= this.buffer.length && !this.closed) {
      const chunk = await this.requestInput("token");
      if (chunk === null) {
        this.closed = true;
        break;
      }
      this.append(chunk);
      this.skipWhitespace();
    }
  }

  async ensureLine() {
    while (this.position >= this.buffer.length && !this.closed) {
      const chunk = await this.requestInput("line");
      if (chunk === null) {
        this.closed = true;
        break;
      }
      this.append(chunk);
    }
  }

  readToken(consume = true) {
    this.skipWhitespace();
    if (this.position >= this.buffer.length) return null;
    const start = this.position;
    while (this.position < this.buffer.length && !/\s/.test(this.buffer[this.position])) this.position += 1;
    const value = this.buffer.slice(start, this.position);
    if (!consume) this.position = start;
    return value;
  }

  skipWhitespace() {
    while (this.position < this.buffer.length && /\s/.test(this.buffer[this.position])) this.position += 1;
  }

  findLineEnd() {
    let index = this.position;
    while (index < this.buffer.length && this.buffer[index] !== "\n" && this.buffer[index] !== "\r") index += 1;
    return index;
  }

  append(chunk) {
    if (this.position > 0) {
      this.buffer = this.buffer.slice(this.position);
      this.position = 0;
    }
    this.buffer += chunk;
  }
}

export function inputMismatch(message) {
  return new Error(`InputMismatchException: ${message}`);
}

