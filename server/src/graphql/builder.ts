import SchemaBuilder from "@pothos/core";
import ErrorsPlugin from "@pothos/plugin-errors";
import type { GraphQLContext } from "./context.js";

export const builder = new SchemaBuilder<{
  Context: GraphQLContext;
  Scalars: {
    DateTime: {
      Input: number;
      Output: number;
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

builder.queryType({});
builder.mutationType({});
