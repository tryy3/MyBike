import SchemaBuilder from "@pothos/core";
import ErrorsPlugin from "@pothos/plugin-errors";
import type { GraphQLContext } from "./context.js";

type JsonLiteralNode = {
  kind: string;
  value?: string | boolean;
  values?: readonly JsonLiteralNode[];
  fields?: readonly { name: { value: string }; value: JsonLiteralNode }[];
};

function parseJsonLiteral(ast: JsonLiteralNode): unknown {
  switch (ast.kind) {
    case "StringValue":
    case "BooleanValue":
      return ast.value;
    case "IntValue":
    case "FloatValue":
      return Number(ast.value);
    case "NullValue":
      return null;
    case "ListValue":
      return ast.values?.map(parseJsonLiteral) ?? [];
    case "ObjectValue":
      return Object.fromEntries(
        ast.fields?.map((field) => [field.name.value, parseJsonLiteral(field.value)]) ?? [],
      );
    default:
      return undefined;
  }
}

export const builder = new SchemaBuilder<{
  Context: GraphQLContext;
  Scalars: {
    DateTime: {
      Input: number;
      Output: number;
    };
    JSON: {
      Input: unknown;
      Output: unknown;
    };
  };
}>({
  plugins: [ErrorsPlugin],
  errors: {
    defaultTypes: [],
  },
});

builder.scalarType("DateTime", {
  serialize: (value) => value,
  parseValue: (value) => {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error("DateTime must be an integer timestamp in milliseconds");
    }
    return value;
  },
});

builder.scalarType("JSON", {
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => parseJsonLiteral(ast as JsonLiteralNode),
});

builder.queryType({});
builder.mutationType({});
