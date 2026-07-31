// A tiny lexical scanner for the VERIFIED `service_blocks` seed grammar — NOT a general-purpose SQL
// parser. It exists only to extract `kind` values from INSERT statements, handling quoted commas,
// doubled apostrophes, comments, nested parentheses, and multi-row VALUES. Each method stays small so
// no function exceeds Sonar's cognitive-complexity budget. No external dependency.

const WHITESPACE = new Set([" ", "\t", "\r", "\n"]);

class SeedScanner {
  private pos = 0;
  constructor(private readonly src: string) {}

  eof(): boolean {
    return this.pos >= this.src.length;
  }
  private peek(offset = 0): string {
    return this.src[this.pos + offset] ?? "";
  }
  private advance(): string {
    return this.src[this.pos++] ?? "";
  }

  private atLineComment(): boolean {
    return this.peek() === "-" && this.peek(1) === "-";
  }
  private atBlockComment(): boolean {
    return this.peek() === "/" && this.peek(1) === "*";
  }
  atQuote(): boolean {
    return this.peek() === "'";
  }
  current(): string {
    return this.peek();
  }

  private skipLineComment(): void {
    while (!this.eof() && this.advance() !== "\n") {
      /* consume to end of line */
    }
  }
  private skipBlockComment(): void {
    this.pos += 2;
    while (!this.eof() && !(this.peek() === "*" && this.peek(1) === "/")) this.pos += 1;
    this.pos += 2;
  }

  /** Skip whitespace and comments. */
  skipTrivia(): void {
    while (!this.eof()) {
      if (WHITESPACE.has(this.peek())) this.pos += 1;
      else if (this.atLineComment()) this.skipLineComment();
      else if (this.atBlockComment()) this.skipBlockComment();
      else break;
    }
  }

  /** Skip a comment if one starts here (returns true); does NOT touch whitespace. */
  skipCommentIfPresent(): boolean {
    if (this.atLineComment()) {
      this.skipLineComment();
      return true;
    }
    if (this.atBlockComment()) {
      this.skipBlockComment();
      return true;
    }
    return false;
  }

  /** Read a single-quoted string (positioned at the opening quote). `decode` controls '' handling. */
  readQuoted(decode: boolean): string {
    const start = this.pos;
    this.pos += 1; // opening quote
    let decoded = "";
    while (!this.eof()) {
      const ch = this.advance();
      if (ch !== "'") {
        decoded += ch;
        continue;
      }
      if (this.peek() === "'") {
        decoded += "'";
        this.pos += 1;
        continue;
      }
      return decode ? decoded : this.src.slice(start, this.pos); // include both quotes when raw
    }
    return decode ? decoded : this.src.slice(start);
  }

  takeChar(): string {
    return this.advance();
  }
}

/** Split SQL into statements on `;` at string-depth 0, dropping `--` and block comments. */
export function splitStatements(sql: string): string[] {
  const sc = new SeedScanner(sql);
  const statements: string[] = [];
  let buf = "";
  while (!sc.eof()) {
    if (sc.skipCommentIfPresent()) continue; // drop comments but PRESERVE whitespace between keywords
    if (sc.atQuote()) {
      buf += sc.readQuoted(false);
      continue;
    }
    const ch = sc.takeChar();
    if (ch === ";") {
      statements.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) statements.push(buf);
  return statements;
}

/** Read one VALUES tuple (positioned at `(`), tracking parenthesis depth so nested expressions and
 *  quoted parens/commas do not terminate it early. Returns decoded field values. */
function readTuple(sc: SeedScanner): string[] {
  sc.takeChar(); // consume '('
  const fields: string[] = [];
  let depth = 0;
  let buf = "";
  while (!sc.eof()) {
    if (sc.atQuote()) {
      buf += sc.readQuoted(true);
      continue;
    }
    const ch = sc.current();
    if (ch === "(") depth += 1;
    else if (ch === ")" && depth > 0) depth -= 1;
    else if (ch === ")") {
      sc.takeChar();
      fields.push(buf.trim());
      return fields;
    } else if (ch === "," && depth === 0) {
      sc.takeChar();
      fields.push(buf.trim());
      buf = "";
      continue;
    }
    buf += sc.takeChar();
  }
  fields.push(buf.trim());
  return fields;
}

/** Read the comma-separated tuple list after VALUES, stopping before any non-tuple clause
 *  (ON CONFLICT / RETURNING / end-of-statement). */
export function readTupleList(valuesSection: string): string[][] {
  const sc = new SeedScanner(valuesSection);
  const tuples: string[][] = [];
  sc.skipTrivia();
  while (sc.current() === "(") {
    tuples.push(readTuple(sc));
    sc.skipTrivia();
    if (sc.current() !== ",") break; // next token is ON CONFLICT / RETURNING / end → stop
    sc.takeChar();
    sc.skipTrivia();
  }
  return tuples;
}

export interface KindExtraction {
  kinds: string[];
  errors: string[];
}

/** The explicit INSERT column list (lower-cased identifiers), or null if not a parsable shape. */
function readInsertColumns(statement: string): string[] | null {
  const m = /service_blocks\s*\(([^)]*)\)\s*values/i.exec(statement);
  if (!m) return null;
  return m[1].split(",").map((c) => c.trim().toLowerCase());
}

/** Extract every `kind` value inserted into `service_blocks` in one seed file. Returns discovered kinds
 *  and any hard errors (missing kind column, tuple/column arity mismatch) — never silently skips. */
export function extractKindsFromSeedSql(sql: string): KindExtraction {
  const kinds: string[] = [];
  const errors: string[] = [];
  for (const stmt of splitStatements(sql)) {
    if (!/insert\s+into\s+service_blocks/i.test(stmt)) continue;
    const cols = readInsertColumns(stmt);
    if (!cols) {
      errors.push("service_blocks INSERT without a parsable column list");
      continue;
    }
    const kindIdx = cols.indexOf("kind");
    if (kindIdx === -1) {
      errors.push("service_blocks INSERT has no `kind` column");
      continue;
    }
    const valuesSection = stmt.slice(/\bvalues\b/i.exec(stmt)!.index + "values".length);
    for (const tuple of readTupleList(valuesSection)) {
      if (tuple.length !== cols.length)
        errors.push(`tuple arity ${tuple.length} != column count ${cols.length}`);
      else kinds.push(tuple[kindIdx]);
    }
  }
  return { kinds, errors };
}
