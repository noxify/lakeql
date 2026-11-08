import { describe, expect, it } from "vitest"

import {
  escapeLikeWildcards,
  escapeLiteral,
  parseTrinoColumnType,
  quoteIdentifier,
  quoteQualifiedIdentifier,
  sanitizeColumnType,
} from "../src/sql-helpers"

// ---------------------------------------------------------------------------
// quoteIdentifier
// ---------------------------------------------------------------------------

describe(quoteIdentifier, () => {
  it("wraps a simple identifier in double quotes", () => {
    expect(quoteIdentifier("my_table")).toBe('"my_table"')
  })

  it("escapes embedded double quotes by doubling", () => {
    expect(quoteIdentifier('has"quote')).toBe('"has""quote"')
  })

  it("escapes multiple embedded double quotes", () => {
    expect(quoteIdentifier('a"b"c')).toBe('"a""b""c"')
  })

  it("preserves dots within a segment", () => {
    expect(quoteIdentifier("catalog.with.dot")).toBe('"catalog.with.dot"')
  })

  it("rejects empty string", () => {
    expect(() => quoteIdentifier("")).toThrow("must not be empty")
  })

  it("rejects NUL character (U+0000)", () => {
    expect(() => quoteIdentifier("abc\0def")).toThrow("control characters")
  })

  it("rejects tab character (U+0009)", () => {
    expect(() => quoteIdentifier("abc\tdef")).toThrow("control characters")
  })

  it("rejects DEL character (U+007F)", () => {
    expect(() => quoteIdentifier("abc\u007Fdef")).toThrow("control characters")
  })

  it("rejects C1 control character U+0080", () => {
    expect(() => quoteIdentifier("abc\u0080def")).toThrow("control characters")
  })

  it("rejects C1 control character U+009F", () => {
    expect(() => quoteIdentifier("abc\u009Fdef")).toThrow("control characters")
  })

  it("accepts characters just outside C1 range (U+00A0)", () => {
    expect(quoteIdentifier("abc\u00A0def")).toBe('"abc\u00A0def"')
  })
})

// ---------------------------------------------------------------------------
// escapeLiteral
// ---------------------------------------------------------------------------

describe(escapeLiteral, () => {
  it("wraps a simple value in single quotes", () => {
    expect(escapeLiteral("hello")).toBe("'hello'")
  })

  it("escapes embedded single quotes by doubling", () => {
    expect(escapeLiteral("it's")).toBe("'it''s'")
  })

  it("escapes multiple single quotes", () => {
    expect(escapeLiteral("schema'name'x")).toBe("'schema''name''x'")
  })

  it("wraps empty string without error", () => {
    expect(escapeLiteral("")).toBe("''")
  })

  it("rejects NUL character", () => {
    expect(() => escapeLiteral("abc\0def")).toThrow("control characters")
  })

  it("rejects tab character", () => {
    expect(() => escapeLiteral("abc\tdef")).toThrow("control characters")
  })

  it("rejects DEL character (U+007F)", () => {
    expect(() => escapeLiteral("abc\u007Fdef")).toThrow("control characters")
  })

  it("rejects C1 control character U+009F", () => {
    expect(() => escapeLiteral("abc\u009Fdef")).toThrow("control characters")
  })
})

// ---------------------------------------------------------------------------
// quoteQualifiedIdentifier
// ---------------------------------------------------------------------------

describe(quoteQualifiedIdentifier, () => {
  it("joins three segments with dots", () => {
    expect(quoteQualifiedIdentifier("iceberg", "public", "orders")).toBe(
      '"iceberg"."public"."orders"'
    )
  })

  it("handles a single segment", () => {
    expect(quoteQualifiedIdentifier("catalog")).toBe('"catalog"')
  })

  it("handles embedded double quotes in segments", () => {
    expect(quoteQualifiedIdentifier('cat"a', 'sch"b', 'tbl"c')).toBe(
      '"cat""a"."sch""b"."tbl""c"'
    )
  })

  it("rejects zero segments", () => {
    expect(() => quoteQualifiedIdentifier()).toThrow("at least one segment")
  })

  it("rejects when any segment is empty", () => {
    expect(() => quoteQualifiedIdentifier("catalog", "", "table")).toThrow(
      "must not be empty"
    )
  })
})

// ---------------------------------------------------------------------------
// parseTrinoColumnType
// ---------------------------------------------------------------------------

describe(parseTrinoColumnType, () => {
  describe("unparameterized types", () => {
    const unparameterized = [
      "BOOLEAN",
      "TINYINT",
      "SMALLINT",
      "INTEGER",
      "BIGINT",
      "REAL",
      "DOUBLE",
      "DATE",
      "TIME",
      "TIME WITH TIME ZONE",
      "TIMESTAMP",
      "TIMESTAMP WITH TIME ZONE",
      "VARBINARY",
    ]

    it.each(unparameterized)("accepts %s in uppercase", (type) => {
      expect(parseTrinoColumnType(type)).toBe(type)
    })

    it.each(unparameterized)("accepts %s in lowercase", (type) => {
      expect(parseTrinoColumnType(type.toLowerCase())).toBe(type)
    })

    it.each(unparameterized)("accepts %s in mixed case", (type) => {
      const mixed = type
        .split(" ")
        .map((w) => (w.at(0) ?? "").toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
      expect(parseTrinoColumnType(mixed)).toBe(type)
    })

    it("accepts with leading/trailing whitespace", () => {
      expect(parseTrinoColumnType("  boolean  ")).toBe("BOOLEAN")
    })

    it("rejects trailing tokens on unparameterized type", () => {
      expect(() => parseTrinoColumnType("BOOLEAN extra")).toThrow(
        "does not accept parameters"
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Parameterized types — DECIMAL
  // ---------------------------------------------------------------------------

  describe("DECIMAL", () => {
    it("accepts DECIMAL(10,2)", () => {
      expect(parseTrinoColumnType("DECIMAL(10,2)")).toBe("DECIMAL(10,2)")
    })

    it("normalizes whitespace: decimal( 10 , 2 )", () => {
      expect(parseTrinoColumnType("decimal( 10 , 2 )")).toBe("DECIMAL(10,2)")
    })

    it("accepts minimum precision and scale: DECIMAL(1,0)", () => {
      expect(parseTrinoColumnType("DECIMAL(1,0)")).toBe("DECIMAL(1,0)")
    })

    it("accepts maximum precision: DECIMAL(38,38)", () => {
      expect(parseTrinoColumnType("DECIMAL(38,38)")).toBe("DECIMAL(38,38)")
    })

    it("rejects precision 0", () => {
      expect(() => parseTrinoColumnType("DECIMAL(0,0)")).toThrow(
        "precision must be an integer from 1 to 38"
      )
    })

    it("rejects precision > 38", () => {
      expect(() => parseTrinoColumnType("DECIMAL(39,0)")).toThrow(
        "precision must be an integer from 1 to 38"
      )
    })

    it("rejects scale > precision", () => {
      expect(() => parseTrinoColumnType("DECIMAL(5,6)")).toThrow(
        "scale must be an integer from 0 to precision"
      )
    })

    it("rejects negative scale", () => {
      // Negative numbers won't tokenise as a single number token;
      // the parser rejects the `-` as an unexpected character
      expect(() => parseTrinoColumnType("DECIMAL(10,-1)")).toThrow(
        "Unexpected character"
      )
    })

    it("rejects missing parameters", () => {
      expect(() => parseTrinoColumnType("DECIMAL")).toThrow(
        "requires parameters"
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Parameterized types — CHAR
  // ---------------------------------------------------------------------------

  describe("CHAR", () => {
    it("accepts CHAR(1)", () => {
      expect(parseTrinoColumnType("CHAR(1)")).toBe("CHAR(1)")
    })

    it("accepts CHAR(255)", () => {
      expect(parseTrinoColumnType("CHAR(255)")).toBe("CHAR(255)")
    })

    it("normalizes whitespace: char( 100 )", () => {
      expect(parseTrinoColumnType("char( 100 )")).toBe("CHAR(100)")
    })

    it("rejects CHAR(0)", () => {
      expect(() => parseTrinoColumnType("CHAR(0)")).toThrow(
        "length must be an integer from 1 to 255"
      )
    })

    it("rejects CHAR(256)", () => {
      expect(() => parseTrinoColumnType("CHAR(256)")).toThrow(
        "length must be an integer from 1 to 255"
      )
    })

    it("rejects CHAR without parameters", () => {
      expect(() => parseTrinoColumnType("CHAR")).toThrow("requires parameters")
    })
  })

  // ---------------------------------------------------------------------------
  // Parameterized types — VARCHAR
  // ---------------------------------------------------------------------------

  describe("VARCHAR", () => {
    it("accepts VARCHAR(1)", () => {
      expect(parseTrinoColumnType("VARCHAR(1)")).toBe("VARCHAR(1)")
    })

    it("accepts VARCHAR(65535)", () => {
      expect(parseTrinoColumnType("VARCHAR(65535)")).toBe("VARCHAR(65535)")
    })

    it("normalizes whitespace: varchar( 255 )", () => {
      expect(parseTrinoColumnType("varchar( 255 )")).toBe("VARCHAR(255)")
    })

    it("rejects VARCHAR(0)", () => {
      expect(() => parseTrinoColumnType("VARCHAR(0)")).toThrow(
        "length must be an integer from 1 to 65535"
      )
    })

    it("rejects VARCHAR(65536)", () => {
      expect(() => parseTrinoColumnType("VARCHAR(65536)")).toThrow(
        "length must be an integer from 1 to 65535"
      )
    })

    it("rejects VARCHAR without parameters", () => {
      expect(() => parseTrinoColumnType("VARCHAR")).toThrow(
        "requires parameters"
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Rejected types
  // ---------------------------------------------------------------------------

  describe("rejected types", () => {
    it("rejects ARRAY", () => {
      expect(() => parseTrinoColumnType("ARRAY")).toThrow(
        "Unsupported column type"
      )
    })

    it("rejects MAP", () => {
      expect(() => parseTrinoColumnType("MAP")).toThrow(
        "Unsupported column type"
      )
    })

    it("rejects ROW", () => {
      expect(() => parseTrinoColumnType("ROW")).toThrow(
        "Unsupported column type"
      )
    })

    it("rejects JSON", () => {
      expect(() => parseTrinoColumnType("JSON")).toThrow(
        "Unsupported column type"
      )
    })

    it("rejects unknown type", () => {
      expect(() => parseTrinoColumnType("FOOBAR")).toThrow(
        "Unsupported column type"
      )
    })

    it("rejects empty string", () => {
      expect(() => parseTrinoColumnType("")).toThrow("must not be empty")
    })

    it("rejects whitespace-only string", () => {
      expect(() => parseTrinoColumnType("   ")).toThrow("must not be empty")
    })
  })

  // ---------------------------------------------------------------------------
  // Dangerous patterns
  // ---------------------------------------------------------------------------

  describe("dangerous patterns", () => {
    it("rejects control characters", () => {
      expect(() => parseTrinoColumnType("INTEGER\0")).toThrow(
        "control characters"
      )
    })

    it("rejects semicolons", () => {
      expect(() => parseTrinoColumnType("INTEGER;")).toThrow(
        "must not contain semicolons"
      )
    })

    it("rejects SQL line comment marker --", () => {
      expect(() => parseTrinoColumnType("INTEGER--DROP TABLE")).toThrow(
        "SQL comment markers"
      )
    })

    it("rejects SQL block comment marker /*", () => {
      expect(() => parseTrinoColumnType("INTEGER/*evil*/")).toThrow(
        "SQL comment markers"
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Idempotence
  // ---------------------------------------------------------------------------

  describe("idempotence", () => {
    it("parsing canonical output produces same output for unparameterized", () => {
      const canonical = parseTrinoColumnType("boolean")
      expect(parseTrinoColumnType(canonical)).toBe(canonical)
    })

    it("parsing canonical output produces same output for DECIMAL", () => {
      const canonical = parseTrinoColumnType("decimal(10,2)")
      expect(parseTrinoColumnType(canonical)).toBe(canonical)
    })

    it("parsing canonical output produces same output for VARCHAR", () => {
      const canonical = parseTrinoColumnType("varchar(255)")
      expect(parseTrinoColumnType(canonical)).toBe(canonical)
    })

    it("parsing canonical output produces same output for CHAR", () => {
      const canonical = parseTrinoColumnType("char(100)")
      expect(parseTrinoColumnType(canonical)).toBe(canonical)
    })

    it("parsing canonical output produces same output for multi-word type", () => {
      const canonical = parseTrinoColumnType("timestamp with time zone")
      expect(parseTrinoColumnType(canonical)).toBe(canonical)
    })
  })
})

// ---------------------------------------------------------------------------
// escapeLikeWildcards
// ---------------------------------------------------------------------------

describe(escapeLikeWildcards, () => {
  it("escapes % wildcard", () => {
    expect(escapeLikeWildcards("100%")).toBe("100\\%")
  })

  it("escapes _ wildcard", () => {
    expect(escapeLikeWildcards("user_name")).toBe("user\\_name")
  })

  it("escapes backslash", () => {
    expect(escapeLikeWildcards("path\\to")).toBe("path\\\\to")
  })

  it("escapes multiple wildcards", () => {
    expect(escapeLikeWildcards("100%_value")).toBe("100\\%\\_value")
  })

  it("returns input unchanged when no wildcards present", () => {
    expect(escapeLikeWildcards("hello")).toBe("hello")
  })

  it("handles empty string", () => {
    expect(escapeLikeWildcards("")).toBe("")
  })
})

// ---------------------------------------------------------------------------
// sanitizeColumnType
// ---------------------------------------------------------------------------
describe(sanitizeColumnType, () => {
  it("allows scalar types unchanged", () => {
    expect(sanitizeColumnType("VARCHAR")).toBe("VARCHAR")
    expect(sanitizeColumnType("DECIMAL(10,2)")).toBe("DECIMAL(10,2)")
    expect(sanitizeColumnType("TIMESTAMP(3)")).toBe("TIMESTAMP(3)")
  })

  it("allows multi-word and composite types", () => {
    expect(sanitizeColumnType("TIMESTAMP WITH TIME ZONE")).toBe(
      "TIMESTAMP WITH TIME ZONE"
    )
    expect(sanitizeColumnType("ARRAY(VARCHAR)")).toBe("ARRAY(VARCHAR)")
    expect(sanitizeColumnType("ROW(id BIGINT, label VARCHAR)")).toBe(
      "ROW(id BIGINT, label VARCHAR)"
    )
  })

  it("trims surrounding whitespace", () => {
    expect(sanitizeColumnType("  VARCHAR  ")).toBe("VARCHAR")
  })

  it("rejects a breakout into a WITH clause", () => {
    expect(() =>
      sanitizeColumnType("VARCHAR) WITH (external_location='x'")
    ).toThrow("Unsupported characters in column type")
  })

  it("rejects quotes and equals signs", () => {
    expect(() => sanitizeColumnType("VARCHAR'")).toThrow(
      "Unsupported characters in column type"
    )
    expect(() => sanitizeColumnType("VARCHAR = 1")).toThrow(
      "Unsupported characters in column type"
    )
  })

  it("rejects semicolons", () => {
    expect(() => sanitizeColumnType("VARCHAR; DROP TABLE x")).toThrow(
      "must not contain semicolons"
    )
  })

  it("rejects SQL comment markers", () => {
    expect(() => sanitizeColumnType("VARCHAR --")).toThrow(
      "SQL comment markers"
    )
    expect(() => sanitizeColumnType("VARCHAR /* x */")).toThrow(
      "SQL comment markers"
    )
  })

  it("rejects unbalanced parentheses", () => {
    expect(() => sanitizeColumnType("ARRAY(VARCHAR")).toThrow(
      "Unbalanced parentheses"
    )
    expect(() => sanitizeColumnType("VARCHAR)")).toThrow(
      "Unbalanced parentheses"
    )
  })

  it("rejects an empty type", () => {
    expect(() => sanitizeColumnType("   ")).toThrow("must not be empty")
  })
})
